import { useMemo } from 'react';
import type { FacetCopy, FacetStack } from '@/types/cards';
import { useBulkSelection } from './useBulkSelection';
import { rowIdsOfSelected } from './selection';

const copiesOf = (stack: FacetStack) => stack.cards;

/**
 * Bulk selection over the in-memory facet stacks of a list (collection or
 * wishlist): every filtered stack, loaded page or not. Keys are `stack.key`.
 */
export function useStackSelection(stacks: FacetStack[], resetKey: string) {
	const bulk = useBulkSelection(resetKey);

	const stackByKey = useMemo(() => {
		const map = new Map<string, FacetStack>();
		for (const stack of stacks) map.set(stack.key, stack);
		return map;
	}, [stacks]);

	const allKeys = useMemo(() => stacks.map((s) => s.key), [stacks]);

	const { selectedCopies, stackCount } = useMemo(() => {
		const copies: FacetCopy[] = [];
		let count = 0;
		for (const key of bulk.selected) {
			const stack = stackByKey.get(key);
			if (!stack) continue;
			count += 1;
			copies.push(...stack.cards);
		}
		return { selectedCopies: copies, stackCount: count };
	}, [bulk.selected, stackByKey]);

	const selectedRowIds = useMemo(
		() => rowIdsOfSelected(bulk.selected, stackByKey, copiesOf),
		[bulk.selected, stackByKey]
	);

	const allSelected = allKeys.length > 0 && allKeys.every((k) => bulk.selected.has(k));

	return { ...bulk, stackByKey, allKeys, allSelected, stackCount, selectedCopies, selectedRowIds };
}
