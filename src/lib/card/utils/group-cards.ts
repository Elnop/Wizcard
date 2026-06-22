import type { Card, CardStack } from '@/types/cards';
import { preferPrint } from '@/lib/card/utils/prefer-print';
import {
	filterCollectionCards,
	getSortValue,
	type CollectionFilters,
} from '@/lib/card/utils/filterCollectionCards';

/** Logical-card grouping key: oracle_id when known, else the print id. */
export function cardGroupKey(card: Card): string {
	return card.oracle_id ?? card.id;
}

/**
 * Groups copies into stacks keyed by oracle_id. Within each stack the cards are
 * ordered so that cards[0] is the preferred representative print (preferPrint:
 * paper > non-promo > normal set > most recent), keeping the chosen vignette
 * consistent between the collection and the import preview.
 */
export function groupByOracleId(cards: Card[]): CardStack[] {
	const map = new Map<string, Card[]>();
	const order: string[] = [];
	for (const card of cards) {
		const key = cardGroupKey(card);
		const existing = map.get(key);
		if (existing) {
			existing.push(card);
		} else {
			order.push(key);
			map.set(key, [card]);
		}
	}
	return order.map((key) => {
		const groupCards = map.get(key)!;
		// Promote the preferred print to cards[0] without disturbing the rest.
		let repIndex = 0;
		for (let i = 1; i < groupCards.length; i++) {
			if (preferPrint(groupCards[repIndex], groupCards[i]) === groupCards[i]) repIndex = i;
		}
		const ordered =
			repIndex === 0
				? groupCards
				: [groupCards[repIndex], ...groupCards.filter((_, i) => i !== repIndex)];
		return { oracleId: key, name: ordered[0].name, cards: ordered };
	});
}

/** Keeps only the copies matching the deck-assignment filter (acts per-copy, before stacking). */
function matchesDeckAssignment(
	card: Card,
	deckAssignment: CollectionFilters['deckAssignment']
): boolean {
	if (deckAssignment === 'all') return true;
	const isAssigned = card.entry.deckId != null;
	return deckAssignment === 'assigned' ? isAssigned : !isAssigned;
}

/**
 * Filters stacks by running the collection filters against each stack's
 * representative card (cards[0]), then sorts the surviving copies inside each
 * matched stack. Shared by the collection view and the import preview so both
 * apply identical filter/sort semantics.
 *
 * The deck-assignment filter is special: it acts on individual copies *before*
 * the stack count is derived, so a 3-copy stack with one assigned copy shows a
 * single card under "assigned" and two cards under "unassigned".
 */
export function filterStacks(stacks: CardStack[], filters: CollectionFilters): CardStack[] {
	// Drop copies that don't match the per-copy assignment filter, then discard
	// stacks left empty (and re-promote a representative for the survivors).
	const assignmentFiltered =
		filters.deckAssignment === 'all'
			? stacks
			: stacks
					.map((stack) => {
						const cards = stack.cards.filter((c) =>
							matchesDeckAssignment(c, filters.deckAssignment)
						);
						return cards.length === stack.cards.length ? stack : { ...stack, cards };
					})
					.filter((stack) => stack.cards.length > 0);

	const representatives = assignmentFiltered.map((s) => s.cards[0]).filter(Boolean);
	const filtered = filterCollectionCards(representatives, filters);

	const stackByOracle = new Map(assignmentFiltered.map((s) => [s.oracleId, s]));
	const { order, dir } = filters;

	return filtered
		.map((rep) => stackByOracle.get(cardGroupKey(rep)))
		.filter((s): s is CardStack => Boolean(s))
		.map((stack) => {
			if (stack.cards.length <= 1) return stack;
			const sorted = [...stack.cards].sort((a, b) => {
				const av = getSortValue(a, order);
				const bv = getSortValue(b, order);
				let cmp: number;
				if (typeof av === 'number' && typeof bv === 'number') {
					cmp = av - bv;
				} else {
					cmp = String(av).localeCompare(String(bv));
				}
				if (dir === 'desc') cmp = -cmp;
				if (cmp === 0) cmp = a.entry.dateAdded.localeCompare(b.entry.dateAdded);
				return cmp;
			});
			return { ...stack, cards: sorted };
		});
}
