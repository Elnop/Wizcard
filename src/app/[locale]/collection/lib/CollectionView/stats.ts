import type { CardStack, CollectionStats } from '@/types/cards';

export function computeCollectionStats(stacks: CardStack[]): CollectionStats {
	const sets = new Set<string>();
	const rarityDistribution: Record<string, number> = {};
	let totalCards = 0;

	for (const stack of stacks) {
		for (const card of stack.cards) {
			totalCards += 1;
			const set = card.set;
			if (set) sets.add(set);
			const rarity = card.rarity;
			if (rarity) rarityDistribution[rarity] = (rarityDistribution[rarity] ?? 0) + 1;
		}
	}

	return {
		totalCards,
		uniqueCards: stacks.length,
		uniqueByEdition: stacks.reduce((n, s) => n + s.cards.length, 0),
		setCount: sets.size,
		rarityDistribution,
	};
}
