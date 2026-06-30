import { useState, useCallback } from 'react';
import type { DeckCardGroup } from '@/types/decks';
import type { ResolvedDeckCard } from './useDeckDetail';

/**
 * Selection state for the deck bulk-action mode. Selection is keyed by the
 * group key (`oracle_id ?? id`) — the same key the deck sections and overlays
 * use — so a single selected entry represents every copy of that card across
 * all zones. `selectedRowIds` resolves those keys back to the flat list of
 * physical `rowId`s the deck mutations operate on.
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

	/**
	 * Resolve the selected group keys into a flat list of `rowId`s, spanning all
	 * zones of each selected group. An optional predicate filters which copies to
	 * include (e.g. only un-owned copies for "add to collection").
	 */
	const selectedRowIds = useCallback(
		(
			groupByCardId: Map<string, DeckCardGroup>,
			predicate?: (card: ResolvedDeckCard) => boolean
		): string[] => {
			const rowIds: string[] = [];
			for (const key of selected) {
				const group = groupByCardId.get(key);
				if (!group) continue;
				for (const copies of group.byZone.values()) {
					for (const card of copies as ResolvedDeckCard[]) {
						if (predicate && !predicate(card)) continue;
						rowIds.push(card.entry.rowId);
					}
				}
			}
			return rowIds;
		},
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
