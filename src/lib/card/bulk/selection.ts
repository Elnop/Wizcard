/**
 * Flat list of the `rowId`s behind the selected stack keys. Stale keys (a stack
 * that no longer exists) are ignored; `predicate` filters which copies to keep.
 */
export function rowIdsOfSelected<S, C extends { entry: { rowId: string } }>(
	selected: ReadonlySet<string>,
	stackByKey: ReadonlyMap<string, S>,
	copiesOf: (stack: S) => readonly C[],
	predicate?: (copy: C) => boolean
): string[] {
	const rowIds: string[] = [];
	for (const key of selected) {
		const stack = stackByKey.get(key);
		if (!stack) continue;
		for (const copy of copiesOf(stack)) {
			if (predicate && !predicate(copy)) continue;
			rowIds.push(copy.entry.rowId);
		}
	}
	return rowIds;
}
