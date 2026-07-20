// All Supabase reads/writes for the precon sync. Runs under the service-role
// key, so RLS is bypassed — no policy grants write access to precons.

import { supabase, flags, log } from './config';
import { mapDeckFormat } from './format-map';
import type { MtgJsonDeck, MtgJsonCard } from './mtgjson-client';
import { setDeckZone, type DeckZone } from '../../src/types/decks';

/**
 * Existing precons as source_deck_id → source_version, for the skip check.
 *
 * MUST paginate: PostgREST caps a select at `max_rows` (1000 in
 * supabase/config.toml) and returns the first page SILENTLY, with no error. An
 * unpaginated read saw only 1000 of ~3000 precons, so every re-run re-imported
 * the other ~2000 it believed were missing — observed as "1988 imported, 1000
 * up-to-date" on a run that should have skipped everything.
 */
export async function fetchSyncedVersions(): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const PAGE = 1000;
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await supabase
			.from('decks')
			.select('source_deck_id, source_version')
			.eq('source', 'mtgjson')
			.range(offset, offset + PAGE - 1);
		if (error) throw new Error(`[precons/db] fetchSyncedVersions: ${error.message}`);
		const rows = data ?? [];
		for (const row of rows) {
			const key = row.source_deck_id as string | null;
			if (key) map.set(key, (row.source_version as string | null) ?? '');
		}
		if (rows.length < PAGE) break;
	}
	return map;
}

// MTGJSON board → our deck zone. maybeboard/tokens have no MTGJSON equivalent.
const BOARDS: { key: 'commander' | 'mainBoard' | 'sideBoard'; zone: DeckZone }[] = [
	{ key: 'commander', zone: 'commander' },
	{ key: 'mainBoard', zone: 'mainboard' },
	{ key: 'sideBoard', zone: 'sideboard' },
];

type CardInsert = {
	deck_id: string;
	owner_id: null;
	scryfall_id: string;
	tags: string[];
};

/**
 * Flatten a deck's boards into one row PER PHYSICAL COPY (count: 4 → 4 rows).
 * There is no quantity column: deck-store.ts stores copies as distinct rows,
 * and the zone lives in tags as `deck:<zone>`, not in the zone column.
 * Cards without a scryfallId are skipped — nothing could resolve them later.
 *
 * Exported so dry-run mode can count planned rows directly, without a real
 * (or fake placeholder) deck_id and without touching the database.
 */
export function buildCardInserts(deckId: string, deck: MtgJsonDeck): CardInsert[] {
	const rows: CardInsert[] = [];
	for (const { key, zone } of BOARDS) {
		const cards: MtgJsonCard[] = deck[key] ?? [];
		for (const card of cards) {
			const scryfallId = card.identifiers?.scryfallId;
			if (!scryfallId) {
				log(`  ⚠ skipping "${card.name}" — no scryfallId`);
				continue;
			}
			for (let i = 0; i < card.count; i++) {
				rows.push({
					deck_id: deckId,
					owner_id: null,
					scryfall_id: scryfallId,
					tags: setDeckZone(undefined, zone),
				});
			}
		}
	}
	return rows;
}

/**
 * Replace a precon's cards wholesale: delete then re-insert. There is no
 * natural per-copy key to upsert on, and a precon's list is immutable for a
 * given MTGJSON version, so full replacement is the simplest correct approach.
 * enriched_at is left NULL so the existing Scryfall enrich worker picks these up.
 */
export async function replacePreconCards(deckId: string, deck: MtgJsonDeck): Promise<number> {
	const rows = buildCardInserts(deckId, deck);
	if (flags.dryRun) {
		log(`  [dry-run] would replace cards with ${rows.length} rows`);
		return rows.length;
	}

	const { error: delError } = await supabase.from('cards').delete().eq('deck_id', deckId);
	if (delError) throw new Error(`[precons/db] delete cards: ${delError.message}`);

	// Chunked: a 100-card commander deck is fine in one request, but a Draft Set
	// can run to several hundred rows and PostgREST payloads have limits.
	const CHUNK = 500;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const { error } = await supabase.from('cards').insert(rows.slice(i, i + CHUNK));
		if (error) throw new Error(`[precons/db] insert cards: ${error.message}`);
	}
	return rows.length;
}

/**
 * Upsert the deck row on the (source, source_deck_id) unique index, then
 * replace its cards. owner_id stays NULL — the decks_owner_matches_source
 * constraint requires precisely that for source='mtgjson'.
 */
export async function upsertPrecon(
	fileName: string,
	deck: MtgJsonDeck,
	version: string
): Promise<{ deckId: string; cardCount: number }> {
	// created_at carries the product's RELEASE date, not the sync time. Every
	// MTGJSON deck has a releaseDate, and the deck search orders by created_at:
	// without this, all ~3000 precons would share the sync minute, arrive as one
	// undifferentiated block, and bury every user deck. Dating them by release
	// orders the catalogue like real products and lets a deck a user made today
	// outrank a 2015 precon.
	const payload = {
		name: deck.name,
		format: mapDeckFormat(deck.type),
		source: 'mtgjson',
		source_deck_id: fileName,
		source_version: version,
		owner_id: null,
		is_public: true,
		created_at: deck.releaseDate ? `${deck.releaseDate}T00:00:00Z` : new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};

	if (flags.dryRun) {
		log(`  [dry-run] would upsert deck "${deck.name}" (format=${payload.format ?? 'null'})`);
		// No deck exists yet in dry-run mode, so count planned rows directly
		// instead of routing through replacePreconCards with a placeholder id.
		const cardCount = buildCardInserts('dry-run', deck).length;
		return { deckId: 'dry-run', cardCount };
	}

	const { data, error } = await supabase
		.from('decks')
		.upsert(payload, { onConflict: 'source,source_deck_id' })
		.select('id')
		.single();
	if (error) throw new Error(`[precons/db] upsert deck "${fileName}": ${error.message}`);

	const deckId = data.id as string;
	const cardCount = await replacePreconCards(deckId, deck);
	return { deckId, cardCount };
}
