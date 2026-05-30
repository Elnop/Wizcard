import type { CardEntry } from '@/types/cards';

type StoredCopy = { scryfallId: string; entry: CardEntry };
export type CollectionData = Record<string, StoredCopy>; // key = rowId

/**
 * Migrates any legacy localStorage format to the current format:
 * Record<rowId, { scryfallId: string; entry: CardEntry }>
 *
 * Handles 4 legacy formats in order:
 * 1. Current: { scryfallId, entry: CardEntry }
 * 2. Legacy CollectionStack: { scryfallId, count, rowIds, meta }
 * 3. Legacy CollectionStack with cardId: { cardId, rowIds, meta }
 * 4. Legacy flat: { id, quantity, dateAdded, ... }
 */
function entryFromMeta(rowId: string, meta: Record<string, unknown>): CardEntry {
	return {
		rowId,
		dateAdded: (meta.dateAdded as string) ?? new Date().toISOString(),
		isFoil: meta.isFoil as boolean | undefined,
		foilType: meta.foilType as CardEntry['foilType'],
		condition: meta.condition as CardEntry['condition'],
		language: meta.language as CardEntry['language'],
		purchasePrice: meta.purchasePrice as string | undefined,
		forTrade: meta.forTrade as boolean | undefined,
		alter: meta.alter as boolean | undefined,
		proxy: meta.proxy as boolean | undefined,
		tags: meta.tags as string[] | undefined,
	};
}

export function migrateCollectionData(parsed: Record<string, unknown>): CollectionData {
	const migrated: CollectionData = {};

	for (const value of Object.values(parsed)) {
		if (!value || typeof value !== 'object') continue;
		const obj = value as Record<string, unknown>;

		// Current format: { scryfallId, entry: { rowId, dateAdded, ... } }
		if (typeof obj.scryfallId === 'string' && obj.entry && typeof obj.entry === 'object') {
			const entry = obj.entry as CardEntry;
			migrated[entry.rowId] = { scryfallId: obj.scryfallId, entry };
			continue;
		}

		// Legacy CollectionStack format: { scryfallId/cardId, rowIds, meta }
		let stackScryfallId: string | null = null;
		if (typeof obj.scryfallId === 'string') stackScryfallId = obj.scryfallId;
		else if (typeof obj.cardId === 'string') stackScryfallId = obj.cardId;
		if (stackScryfallId && Array.isArray(obj.rowIds) && obj.meta && typeof obj.meta === 'object') {
			const meta = obj.meta as Record<string, unknown>;
			for (const rowId of obj.rowIds as string[]) {
				migrated[rowId] = { scryfallId: stackScryfallId, entry: entryFromMeta(rowId, meta) };
			}
			continue;
		}

		// Legacy flat format: { id, quantity, dateAdded, ... }
		if (typeof obj.id === 'string') {
			const count = (obj.quantity as number) ?? 1;
			for (const rowId of Array.from({ length: count }, () => crypto.randomUUID())) {
				migrated[rowId] = { scryfallId: obj.id, entry: entryFromMeta(rowId, obj) };
			}
		}
	}

	return migrated;
}
