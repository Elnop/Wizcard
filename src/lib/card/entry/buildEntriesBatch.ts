import type { CardEntry } from '@/types/cards';

export function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}

/** Fabrique N entries distinctes (rowId unique chacune) pour une même carte. Pur. */
export function buildEntriesBatch(
	scryfallId: string,
	count: number,
	entryPatch?: Partial<CardEntry>
): Array<{ rowId: string; scryfallId: string; entry: CardEntry }> {
	const n = Math.max(1, Math.floor(count) || 1);
	const rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }> = [];
	for (let i = 0; i < n; i++) {
		const rowId = crypto.randomUUID();
		rows.push({ rowId, scryfallId, entry: newEntry(rowId, entryPatch) });
	}
	return rows;
}
