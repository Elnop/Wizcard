import { useState, useCallback } from 'react';
import type { ResolvedDeckCard } from './useDeckDetail';
import type { DeckStack } from './useDeckCardSections';

/**
 * Flat list of the `rowId`s behind the selected stack keys. Stale keys (a stack
 * that no longer exists) are ignored; `predicate` filters which copies to include
 * (e.g. only un-owned copies for "add to collection").
 */
export function rowIdsOfSelectedStacks(
	selected: ReadonlySet<string>,
	stackByKey: ReadonlyMap<string, DeckStack>,
	predicate?: (card: ResolvedDeckCard) => boolean
): string[] {
	const rowIds: string[] = [];
	for (const key of selected) {
		const stack = stackByKey.get(key);
		if (!stack) continue;
		for (const card of stack.copies) {
			if (predicate && !predicate(card)) continue;
			rowIds.push(card.entry.rowId);
		}
	}
	return rowIds;
}

/**
 * Selection state for the deck bulk-action mode. Selection is keyed by the
 * displayed stack (`DeckStack.selectionKey` = zone + stack key): one selected
 * tile = that stack's copies in that zone. `selectedRowIds` resolves the keys to
 * the flat list of physical `rowId`s the deck mutations operate on.
 */
export function useDeckBulkSelection() {
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const toggle = useCallback((key: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const clear = useCallback(() => setSelected(new Set()), []);

	const enter = useCallback(() => setSelectMode(true), []);

	const exit = useCallback(() => {
		setSelectMode(false);
		setSelected(new Set());
	}, []);

	const toggleMode = useCallback(() => {
		setSelectMode((on) => {
			if (on) setSelected(new Set());
			return !on;
		});
	}, []);

	/**
	 * Select all `allKeys` when not every key is already selected, otherwise
	 * clear — drives the "Select all / Deselect all" toggle.
	 */
	const toggleSelectAll = useCallback((allKeys: string[]) => {
		setSelected((prev) => {
			const allSelected = allKeys.length > 0 && allKeys.every((k) => prev.has(k));
			return allSelected ? new Set() : new Set(allKeys);
		});
	}, []);

	/**
	 * Toggle a subset of `keys` together: if every key is already selected, remove
	 * them all; otherwise add them all (leaving the rest of the selection intact).
	 * Drives the per-section "select all in section" buttons.
	 */
	const toggleKeys = useCallback((keys: string[]) => {
		setSelected((prev) => {
			const next = new Set(prev);
			const allSelected = keys.length > 0 && keys.every((k) => next.has(k));
			for (const k of keys) {
				if (allSelected) next.delete(k);
				else next.add(k);
			}
			return next;
		});
	}, []);

	/** Whether every key in `keys` is currently selected (and `keys` is non-empty). */
	const areAllSelected = useCallback(
		(keys: string[]) => keys.length > 0 && keys.every((k) => selected.has(k)),
		[selected]
	);

	const selectedRowIds = useCallback(
		(
			stackByKey: ReadonlyMap<string, DeckStack>,
			predicate?: (card: ResolvedDeckCard) => boolean
		): string[] => rowIdsOfSelectedStacks(selected, stackByKey, predicate),
		[selected]
	);

	return {
		selectMode,
		selected,
		toggle,
		clear,
		enter,
		exit,
		toggleMode,
		toggleSelectAll,
		toggleKeys,
		areAllSelected,
		selectedRowIds,
	};
}
