import type { CardEntry } from '@/types/cards';

type CollectionEntry = { scryfallId: string; entry: CardEntry };

export function findFreeCollectionCopy(
	scryfallId: string,
	oracleId: string,
	entries: CollectionEntry[],
	scryfallIdToOracleId: Map<string, string>
): { rowId: string; scryfallId: string } | null {
	// Pass 1: same edition (scryfallId exact match)
	for (const e of entries) {
		if (e.scryfallId === scryfallId && !e.entry.deckId) {
			return { rowId: e.entry.rowId, scryfallId: e.scryfallId };
		}
	}

	// Pass 2: same card, different edition (oracle_id match)
	for (const e of entries) {
		if (scryfallIdToOracleId.get(e.scryfallId) === oracleId && !e.entry.deckId) {
			return { rowId: e.entry.rowId, scryfallId: e.scryfallId };
		}
	}

	return null;
}
