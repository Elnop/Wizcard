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
	const { data, error } = await supabase
		.from('cards')
		.select('scryfall_id, tags')
		.eq('deck_id', deckId);
	if (error || !data || data.length === 0) return null;

	// Dedupe ids (a deck can hold multiple copies) while remembering which ids
	// are tagged as the commander, so we can prioritise its art.
	const commanderIds = new Set<string>();
	const seen = new Set<string>();
	const ids: string[] = [];
	for (const row of data) {
		const id = row.scryfall_id as string | null;
		if (!id) continue;
		const tags = (row.tags as string[] | null) ?? [];
		if (tags.includes('deck:commander')) commanderIds.add(id);
		if (!seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	}
	// Scryfall's /cards/collection accepts at most 75 identifiers per request;
	// the first batch is plenty to pick a cover from.
	const batch = ids.slice(0, 75);
	if (batch.length === 0) return null;

	let cards: ScryfallCoverCard[];
	try {
		const res = await fetch('https://api.scryfall.com/cards/collection', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'User-Agent': 'Mozilla/5.0 (compatible; WizcardBot/1.0; +https://wizcard.xyz)',
			},
			body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
			signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) {
			await res.body?.cancel();
			return null;
		}
		const json = (await res.json()) as { data?: ScryfallCoverCard[] };
		cards = json.data ?? [];
	} catch {
		return null;
	}
	if (cards.length === 0) return null;

	// Same priority order as pickCoverArt: commander > non-land > any card.
	const isLand = (c: ScryfallCoverCard) => (c.type_line ?? '').toLowerCase().includes('land');
	const predicates: Array<(c: ScryfallCoverCard) => boolean> = [
		(c) => commanderIds.has(c.id),
		(c) => !isLand(c),
		() => true,
	];
	for (const predicate of predicates) {
		const match = cards.find(predicate);
		const url = match ? artCropOf(match) : null;
		if (url) return url;
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
