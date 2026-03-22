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

		// Legacy CollectionStack format: { scryfallId, count, rowIds, meta }
		if (
			typeof obj.scryfallId === 'string' &&
			Array.isArray(obj.rowIds) &&
			obj.meta &&
			typeof obj.meta === 'object'
		) {
			const meta = obj.meta as Record<string, unknown>;
			const rowIds = obj.rowIds as string[];
			for (const rowId of rowIds) {
				const entry: CardEntry = {
					rowId,
					dateAdded: (meta.dateAdded as string) ?? new Date().toISOString(),
					isFoil: meta.isFoil as boolean | undefined,
					foilType: meta.foilType as 'foil' | 'etched' | undefined,
					condition: meta.condition as CardEntry['condition'],
					language: meta.language as CardEntry['language'],
					purchasePrice: meta.purchasePrice as string | undefined,
					forTrade: meta.forTrade as boolean | undefined,
					alter: meta.alter as boolean | undefined,
					proxy: meta.proxy as boolean | undefined,
					tags: meta.tags as string[] | undefined,
				};
				migrated[rowId] = { scryfallId: obj.scryfallId, entry };
			}
			continue;
		}

		// Legacy CollectionStack with cardId instead of scryfallId
		if (
			typeof obj.cardId === 'string' &&
			Array.isArray(obj.rowIds) &&
			obj.meta &&
			typeof obj.meta === 'object'
		) {
			const meta = obj.meta as Record<string, unknown>;
			const rowIds = obj.rowIds as string[];
			for (const rowId of rowIds) {
				const entry: CardEntry = {
					rowId,
					dateAdded: (meta.dateAdded as string) ?? new Date().toISOString(),
					isFoil: meta.isFoil as boolean | undefined,
					foilType: meta.foilType as 'foil' | 'etched' | undefined,
					condition: meta.condition as CardEntry['condition'],
					language: meta.language as CardEntry['language'],
					purchasePrice: meta.purchasePrice as string | undefined,
					forTrade: meta.forTrade as boolean | undefined,
					alter: meta.alter as boolean | undefined,
					proxy: meta.proxy as boolean | undefined,
					tags: meta.tags as string[] | undefined,
				};
				migrated[rowId] = { scryfallId: obj.cardId, entry };
			}
			continue;
		}

		// Legacy flat format: { id, quantity, dateAdded, ... }
		if (typeof obj.id === 'string') {
			const count = (obj.quantity as number) ?? 1;
			const rowIds = Array.from({ length: count }, () => crypto.randomUUID());
			for (const rowId of rowIds) {
				const entry: CardEntry = {
					rowId,
					dateAdded: (obj.dateAdded as string) ?? new Date().toISOString(),
					isFoil: obj.isFoil as boolean | undefined,
					foilType: obj.foilType as 'foil' | 'etched' | undefined,
					condition: obj.condition as CardEntry['condition'],
					language: obj.language as CardEntry['language'],
					tags: obj.tags as string[] | undefined,
					purchasePrice: obj.purchasePrice as string | undefined,
					forTrade: obj.forTrade as boolean | undefined,
					alter: obj.alter as boolean | undefined,
					proxy: obj.proxy as boolean | undefined,
				};
				migrated[rowId] = { scryfallId: obj.id, entry };
			}
			continue;
		}
	}

	return migrated;
}
