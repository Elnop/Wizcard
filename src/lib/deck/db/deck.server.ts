import { createClient } from '@/lib/supabase/server';
import type { DeckMeta, DeckSource } from '@/types/decks';
import type { DeckFormat } from '@/types/decks';

type ScryfallImageUris = { art_crop?: string } | undefined;
type ScryfallCoverCard = {
	id: string;
	type_line?: string;
	image_uris?: ScryfallImageUris;
	card_faces?: Array<{ image_uris?: ScryfallImageUris }>;
};

function artCropOf(card: ScryfallCoverCard): string | null {
	return card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? null;
}

/**
 * Server-side equivalent of the client's `coverArtUrl` fallback (see
 * usePublicDeckDetail / pickCoverArt): when a deck has no explicit
 * `cover_art_url`, derive one from its cards so the OG image matches what the
 * site shows. Priority: commander (tagged `deck:commander`) > non-land > any.
 *
 * Unlike the client resolver (IndexedDB + throttle, browser-only), this hits
 * the Scryfall `/cards/collection` endpoint directly with a real User-Agent —
 * Scryfall, behind Cloudflare, rejects default HTTP-library UAs. Best-effort:
 * returns null on any failure so the OG image degrades to its plain background.
 */
export async function fetchDeckCoverArtServer(deckId: string): Promise<string | null> {
	const supabase = await createClient();
	// Match the site's card ordering exactly: fetchDeckCardRows selects with
	// `.order('date_added', { ascending: true })`, and usePublicDeckDetail feeds
	// those (non-deduped) copies to pickCoverArt. Ordering at the DB with the
	// same key means tied `date_added` rows come back in the same physical order
	// on both paths, so the winning card is identical.
	const { data, error } = await supabase
		.from('cards')
		.select('scryfall_id, tags')
		.eq('deck_id', deckId)
		.order('date_added', { ascending: true });
	if (error || !data || data.length === 0) return null;

	const copies = data
		.map((row) => ({
			id: (row.scryfall_id ?? null) as string | null,
			tags: (row.tags as string[] | null) ?? [],
		}))
		.filter((c): c is { id: string; tags: string[] } => c.id !== null);
	if (copies.length === 0) return null;

	// Priority 1 — the commander. It's pickCoverArt's top choice, so resolve
	// ONLY the commander ids first (usually one): a tiny request that also lets
	// us skip fetching the whole deck. The commander can sit anywhere in the
	// list, so it must not be lost to a truncated batch (the earlier bug).
	const commanderIds = [
		...new Set(copies.filter((c) => c.tags.includes('deck:commander')).map((c) => c.id)),
	];
	if (commanderIds.length > 0) {
		const cmdrById = await resolveScryfallCards(commanderIds);
		for (const copy of copies) {
			if (!copy.tags.includes('deck:commander')) continue;
			const url = artCropOf(cmdrById.get(copy.id) ?? ({} as ScryfallCoverCard));
			if (url) return url;
		}
	}

	// Priority 2 & 3 — first non-land, else any card. Resolve every unique id
	// (batched, never truncated) so the pick matches the site's over the full
	// date-ordered deck.
	const byId = await resolveScryfallCards([...new Set(copies.map((c) => c.id))]);
	if (byId.size === 0) return null;

	const isLand = (c: ScryfallCoverCard) => (c.type_line ?? '').toLowerCase().includes('land');
	return (
		firstArt(copies, byId, (card) => !isLand(card)) ?? firstArt(copies, byId, () => true) ?? null
	);
}

/**
 * Walk the ordered copies and return the art_crop of the first card that both
 * resolved and satisfies `predicate` — mirroring pickCoverArt's `Array.find`
 * over the date-ordered card list.
 */
function firstArt(
	copies: Array<{ id: string }>,
	byId: Map<string, ScryfallCoverCard>,
	predicate: (card: ScryfallCoverCard) => boolean
): string | null {
	for (const copy of copies) {
		const card = byId.get(copy.id);
		if (card && predicate(card)) {
			const url = artCropOf(card);
			if (url) return url;
		}
	}
	return null;
}

/**
 * Resolve Scryfall print ids to card objects via `/cards/collection`, batched
 * in chunks of 75 (the endpoint's per-request cap). Sends a real User-Agent
 * (Cloudflare rejects default library UAs). Best-effort: failed batches are
 * skipped, and whatever resolved is returned.
 */
async function resolveScryfallCards(ids: string[]): Promise<Map<string, ScryfallCoverCard>> {
	const byId = new Map<string, ScryfallCoverCard>();
	try {
		for (let i = 0; i < ids.length; i += 75) {
			const batch = ids.slice(i, i + 75);
			const res = await fetch('https://api.scryfall.com/cards/collection', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					'User-Agent': 'Mozilla/5.0 (compatible; WizcardBot/1.0; +https://wizcard.xyz)',
				},
				body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
				signal: AbortSignal.timeout(5000),
			});
			if (!res.ok) {
				await res.body?.cancel();
				continue;
			}
			const json = (await res.json()) as { data?: ScryfallCoverCard[] };
			for (const card of json.data ?? []) byId.set(card.id, card);
		}
	} catch {
		// Fall through with whatever resolved so far.
	}
	return byId;
}

/**
 * Server-side deck metadata fetch for generateMetadata / OG / sitemap. Uses the
 * SSR Supabase client (fetchDeckMetaById in deck/db uses the browser client and
 * is unusable in RSC). Public decks are readable by anon via RLS.
 */
export async function fetchDeckMetaServer(deckId: string): Promise<DeckMeta | null> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from('decks')
		.select(
			'id, owner_id, name, format, description, cover_art_url, source, is_public, created_at, updated_at'
		)
		.eq('id', deckId)
		.maybeSingle();
	if (error || !data) return null;
	return {
		id: data.id as string,
		ownerId: (data.owner_id ?? null) as string | null,
		name: data.name as string,
		format: (data.format ?? null) as DeckFormat | null,
		description: (data.description ?? null) as string | null,
		folderId: null,
		coverArtUrl: (data.cover_art_url ?? null) as string | null,
		source: (data.source === 'mtgjson' ? 'mtgjson' : 'user') as DeckSource,
		isPublic: (data.is_public ?? true) as boolean,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string,
	};
}
