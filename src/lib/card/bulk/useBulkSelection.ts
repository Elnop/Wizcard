import { useCallback, useState } from 'react';

/**
 * Selection state for a bulk-action mode, keyed by displayed stack. The
 * selection is cleared at render time whenever `resetKey` changes (stacking
 * criteria, filters): stack keys depend on them, so old keys would point at
 * other copies or nothing.
 */
export function useBulkSelection(resetKey: string) {
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [prevResetKey, setPrevResetKey] = useState(resetKey);
	if (prevResetKey !== resetKey) {
		setPrevResetKey(resetKey);
		setSelected(new Set());
	}

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

	/** Select all `allKeys` unless every one is already selected, then clear. */
	const toggleSelectAll = useCallback((allKeys: string[]) => {
		setSelected((prev) => {
			const allSelected = allKeys.length > 0 && allKeys.every((k) => prev.has(k));
			return allSelected ? new Set() : new Set(allKeys);
		});
	}, []);

	/** Toggle a subset together: all selected → remove them, else add them. */
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

	const areAllSelected = useCallback(
		(keys: string[]) => keys.length > 0 && keys.every((k) => selected.has(k)),
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
	};
}
