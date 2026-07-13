import { useState, useCallback } from 'react';
import type { ResolvedDeckCard } from './useDeckDetail';

export type DeckSortOrder = 'cmc' | 'name' | 'rarity';
export type DeckSortDir = 'asc' | 'desc';

const RARITY_RANK: Record<string, number> = {
	common: 0,
	uncommon: 1,
	rare: 2,
	mythic: 3,
};

function compareCards(
	a: ResolvedDeckCard,
	b: ResolvedDeckCard,
	order: DeckSortOrder,
	dir: DeckSortDir
): number {
	let primary = 0;

	if (order === 'cmc') {
		primary = (a.cmc ?? 0) - (b.cmc ?? 0);
	} else if (order === 'name') {
		primary = a.name.localeCompare(b.name);
	} else if (order === 'rarity') {
		primary = (RARITY_RANK[a.rarity ?? ''] ?? 4) - (RARITY_RANK[b.rarity ?? ''] ?? 4);
	}

	if (dir === 'desc') primary = -primary;

	// Secondary: name asc (always)
	if (primary !== 0) return primary;
	return a.name.localeCompare(b.name);
}

export function useDeckSort() {
	const [order, setOrder] = useState<DeckSortOrder>('cmc');
	const [dir, setDir] = useState<DeckSortDir>('asc');

	const sortCards = useCallback(
		(cards: ResolvedDeckCard[]): ResolvedDeckCard[] =>
			[...cards].sort((a, b) => compareCards(a, b, order, dir)),
		[order, dir]
	);

	return { order, dir, setOrder, setDir, sortCards };
}
