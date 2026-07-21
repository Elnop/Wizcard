import type { CardEntry } from '@/types/cards';

type CollectionEntry = { scryfallId: string; entry: CardEntry };

export function findFreeCollectionCopy(
	scryfallId: string,
	oracleId: string,
	entries: CollectionEntry[],
	scryfallIdToOracleId: Map<string, string>,
	/**
	 * rowIds already earmarked for assignment in this batch. Used when resolving
	 * several copies in a row against the same (stale) `entries` snapshot: the
	 * store isn't re-read between iterations, so callers must exclude rows they
	 * have already picked to avoid returning the same free copy twice.
	 */
	excludeRowIds?: ReadonlySet<string>
): { rowId: string; scryfallId: string } | null {
	// Pass 1: same edition (scryfallId exact match)
	for (const e of entries) {
		if (e.scryfallId === scryfallId && !e.entry.deckId && !excludeRowIds?.has(e.entry.rowId)) {
			return { rowId: e.entry.rowId, scryfallId: e.scryfallId };
		}
	}

	// Pass 2: same card, different edition (oracle_id match)
	for (const e of entries) {
		if (
			scryfallIdToOracleId.get(e.scryfallId) === oracleId &&
			!e.entry.deckId &&
			!excludeRowIds?.has(e.entry.rowId)
		) {
			return { rowId: e.entry.rowId, scryfallId: e.scryfallId };
		}
	}

	return null;
}
