import type { FacetCopy, StackBy, StackCriterion } from '@/types/cards';
import { preferPrint } from '@/lib/card/utils/prefer-print';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import {
	filterCollectionCards,
	getSortValue,
	type CollectionFilters,
} from '@/lib/card/utils/filterCollectionCards';

type StackOf<T> = { key: string; name: string; cards: T[] };

/** Logical-card grouping key: oracle_id when known, else the print id. */
export function cardGroupKey(card: { oracle_id?: string; id: string }): string {
	return card.oracle_id ?? card.id;
}

/** Every criterion, in the fixed order its key segment is appended. */
export const STACK_CRITERIA: readonly StackCriterion[] = [
	'print',
	'finish',
	'condition',
	'language',
	'flags',
];

function segment(copy: FacetCopy, criterion: StackCriterion): string {
	const { entry } = copy;
	switch (criterion) {
		case 'print':
			return copy.id;
		case 'finish':
			if (!entry.isFoil) return 'nonfoil';
			return entry.foilType === 'etched' ? 'etched' : 'foil';
		case 'condition':
			return entry.condition ?? 'NM';
		case 'language':
			// entry.language is a language name ('French'); prints carry a Scryfall
			// code ('fr'). Normalise to the name so unset copies stack with explicit ones.
			return (
				entry.language ??
				('lang' in copy && copy.lang ? SCRYFALL_CODE_TO_LANGUAGE[copy.lang] : undefined) ??
				'English'
			);
		case 'flags':
			return `${entry.proxy ? 1 : 0}${entry.alter ? 1 : 0}${entry.forTrade ? 1 : 0}`;
	}
}

/**
 * Stack key of a copy: the logical card (cardGroupKey) plus one segment per
 * selected criterion, in STACK_CRITERIA order so the array order is irrelevant.
 * Missing values get explicit defaults so "unset" stacks with the default.
 * 'copy' disables stacking: the key is the physical copy's rowId.
 */
export function stackKeyOf(copy: FacetCopy, stackBy: StackBy): string {
	if (stackBy === 'copy') return copy.entry.rowId;
	let key = cardGroupKey(copy);
	for (const criterion of STACK_CRITERIA) {
		if (stackBy.includes(criterion)) key += `|${segment(copy, criterion)}`;
	}
	return key;
}

/**
 * Groups copies into stacks keyed by `stackKeyOf(copy, stackBy)` (default: by
 * name). Within each stack the cards are
 * ordered so that cards[0] is the preferred representative print (preferPrint:
 * paper > non-promo > normal set > most recent), keeping the chosen vignette
 * consistent between the collection and the import preview.
 */
export function groupByStack<T extends FacetCopy>(cards: T[], stackBy: StackBy = []): StackOf<T>[] {
	const map = new Map<string, T[]>();
	const order: string[] = [];
	for (const card of cards) {
		const key = stackKeyOf(card, stackBy);
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
		return { key, name: ordered[0].name, cards: ordered };
	});
}

/** Keeps only the copies matching the deck-assignment filter (acts per-copy, before stacking). */
function matchesDeckAssignment(
	card: FacetCopy,
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
export function filterStacks<T extends FacetCopy>(
	stacks: StackOf<T>[],
	filters: CollectionFilters
): StackOf<T>[] {
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

	// Map each surviving representative back to its stack by identity (rowId):
	// several stacks can share one oracle_id once stacking is finer than by-name.
	const stackByRepRowId = new Map(
		assignmentFiltered.map((s) => [s.cards[0]?.entry.rowId, s] as const)
	);
	const { order, dir } = filters;

	const ordered = filtered
		.map((rep) => stackByRepRowId.get(rep.entry.rowId))
		.filter((s): s is StackOf<T> => Boolean(s));
	if (order === 'quantity') {
		// Most copies first by default ('auto'), like a "how many do I own" view;
		// ties fall back to name so equal counts stay alphabetical.
		const sign = dir === 'asc' ? 1 : -1;
		ordered.sort(
			(a, b) => sign * (a.cards.length - b.cards.length) || a.name.localeCompare(b.name)
		);
	}

	return ordered.map((stack) => {
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
