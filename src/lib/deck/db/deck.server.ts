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

	// Fetch card data for the unique ids (Scryfall's /cards/collection caps at
	// 75 identifiers). Dedup is only to shrink the request; selection below runs
	// over the ordered copies, keyed into this map — so response order is moot.
	const uniqueIds = [...new Set(copies.map((c) => c.id))].slice(0, 75);
	if (uniqueIds.length === 0) return null;

	let byId: Map<string, ScryfallCoverCard>;
	try {
		const res = await fetch('https://api.scryfall.com/cards/collection', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'User-Agent': 'Mozilla/5.0 (compatible; WizcardBot/1.0; +https://wizcard.xyz)',
			},
			body: JSON.stringify({ identifiers: uniqueIds.map((id) => ({ id })) }),
			signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) {
			await res.body?.cancel();
			return null;
		}
		const json = (await res.json()) as { data?: ScryfallCoverCard[] };
		byId = new Map((json.data ?? []).map((c) => [c.id, c]));
	} catch {
		return null;
	}
	if (byId.size === 0) return null;

	// Same priority order as pickCoverArt (commander > non-land > any), applied
	// over the date-sorted copies so the first match matches the site's choice.
	const isLand = (c: ScryfallCoverCard) => (c.type_line ?? '').toLowerCase().includes('land');
	const predicates: Array<(copy: (typeof copies)[number], card: ScryfallCoverCard) => boolean> = [
		(copy) => copy.tags.includes('deck:commander'),
		(_copy, card) => !isLand(card),
		() => true,
	];
	for (const predicate of predicates) {
		for (const copy of copies) {
			const card = byId.get(copy.id);
			if (!card || !predicate(copy, card)) continue;
			const url = artCropOf(card);
			if (url) return url;
		}
	}
	return null;
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
