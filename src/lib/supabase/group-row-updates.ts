import type { DbPatch } from '@/lib/card/db/entry-db-patch';

export type BulkUpdateRow = { rowId: string; updates: DbPatch };

/** PostgREST rejects an `in()` list of ~300 uuids (414); 200 is the house chunk. */
export const BULK_UPDATE_CHUNK = 200;

function stableKey(updates: DbPatch): string {
	const sorted = Object.keys(updates)
		.sort()
		.map((k) => [k, updates[k as keyof DbPatch]]);
	return JSON.stringify(sorted);
}

/**
 * Groups rows that receive the exact same patch, so each group is written with a
 * single `update … where id in (…)` per chunk. Empty patches are dropped.
 */
export function groupRowUpdates(
	rows: BulkUpdateRow[],
	chunkSize: number = BULK_UPDATE_CHUNK
): Array<{ updates: DbPatch; rowIds: string[] }> {
	const byKey = new Map<string, { updates: DbPatch; rowIds: string[] }>();
	for (const row of rows) {
		if (Object.keys(row.updates).length === 0) continue;
		const key = stableKey(row.updates);
		const group = byKey.get(key);
		if (group) group.rowIds.push(row.rowId);
		else byKey.set(key, { updates: row.updates, rowIds: [row.rowId] });
	}
	const out: Array<{ updates: DbPatch; rowIds: string[] }> = [];
	for (const group of byKey.values()) {
		for (let i = 0; i < group.rowIds.length; i += chunkSize) {
			out.push({ updates: group.updates, rowIds: group.rowIds.slice(i, i + chunkSize) });
		}
	}
	return out;
}
