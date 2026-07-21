import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';

/** A deck copy reduced to what the index needs. */
export type DeckCopyForIndex = {
	oracleId: string | undefined;
	tags: string[] | undefined;
};

/** oracle_id → (zone → number of copies in that zone). */
export type DeckCardIndex = Map<string, Map<DeckZone, number>>;

/**
 * Build a per-oracle, per-zone copy count from deck copies. Copies without an
 * oracleId are ignored. Zone is derived from tags via getDeckZone (untagged
 * copies default to 'mainboard').
 */
export function buildDeckCardIndex(copies: DeckCopyForIndex[]): DeckCardIndex {
	const index: DeckCardIndex = new Map();
	for (const copy of copies) {
		if (!copy.oracleId) continue;
		const zone = getDeckZone(copy.tags);
		let byZone = index.get(copy.oracleId);
		if (!byZone) {
			byZone = new Map();
			index.set(copy.oracleId, byZone);
		}
		byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
	}
	return index;
}
