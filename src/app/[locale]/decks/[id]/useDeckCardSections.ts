import { useMemo } from 'react';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { DeckZone, DeckCardGroup } from '@/types/decks';
import type { StackBy } from '@/types/cards';
import { groupByCardType } from '@/lib/card/utils/group-by-card-type';
import { groupByStack } from '@/lib/card/utils/group-cards';
import { cardKey } from '@/lib/card/utils/card-key';
import type { ResolvedDeckCard } from './useDeckDetail';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

export type DeckGroupBy = 'type' | 'none';

/** One displayed deck tile: a stack of copies inside a single zone. */
export type DeckStack = { selectionKey: string; zone: DeckZone; copies: ResolvedDeckCard[] };

const EMPTY_STACK_BY: StackBy = [];

/**
 * Deduplicate a flat list of card copies down to one representative per logical
 * card (keyed by oracle_id, falling back to the print id). The first copy seen
 * for each key is kept so its `entry.tags` reflect the correct zone. Used to
 * render the Tokens panel as one card per token instead of one card per copy —
 * the per-stack count is shown by the card overlay, which reads the real total
 * from the shared group map.
 */
export function dedupeByOracle<T extends ResolvedDeckCard>(cards: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const card of cards) {
		const key = card.oracle_id ?? card.id;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(card);
	}
	return result;
}

/**
 * Per-zone stacks. Every copy's rowId maps to its stack so any copy used as a
 * tile (section representative, token dedupe pick) resolves its stack. Tokens
 * are always stacked by name (their panel dedupes by oracle).
 */
function buildZoneStacks(
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>,
	zones: DeckZone[],
	stackBy: StackBy
) {
	const stackByRowId = new Map<string, DeckStack>();
	const zoneStacks = new Map<DeckZone, ResolvedDeckCard[][]>();
	for (const zone of zones) {
		const zoneBy = zone === 'tokens' ? EMPTY_STACK_BY : stackBy;
		const stacks = groupByStack(cardsByZone[zone] ?? [], zoneBy);
		zoneStacks.set(
			zone,
			stacks.map((s) => s.cards)
		);
		for (const s of stacks) {
			const stack: DeckStack = { selectionKey: `${zone}:${s.key}`, zone, copies: s.cards };
			for (const c of s.cards) stackByRowId.set(c.entry.rowId, stack);
		}
	}
	return { stackByRowId, zoneStacks };
}

/**
 * Deck sections (one per zone, stacked per `stackBy` inside each zone) plus the
 * cross-zone oracle groups used by the card modal. Pure — see useDeckCardSections.
 */
export function buildDeckCardSections(
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>,
	showCommander: boolean,
	sortCards: (cards: ResolvedDeckCard[]) => ResolvedDeckCard[],
	groupBy: DeckGroupBy,
	stackBy: StackBy
) {
	const zones: DeckZone[] = showCommander
		? ['commander', 'mainboard', 'sideboard', 'maybeboard']
		: ['mainboard', 'sideboard', 'maybeboard'];

	// The tokens zone is rendered in its own panel (not as a main-list section),
	// but it must be in the group map so the shared CardModal flow resolves token cards.
	const groupZones: DeckZone[] = [...zones, 'tokens'];

	// Build groupByCardId keyed by oracle_id, accumulating copies per zone
	const groupByCardId = new Map<string, DeckCardGroup>();

	for (const zone of groupZones) {
		for (const rc of cardsByZone[zone] ?? []) {
			const key = rc.oracle_id ?? rc.id;
			if (!groupByCardId.has(key)) {
				groupByCardId.set(key, {
					representative: rc,
					byZone: new Map(),
					totalCount: 0,
				});
			}
			const group = groupByCardId.get(key)!;
			const existing = group.byZone.get(zone) ?? [];
			existing.push(rc);
			group.byZone.set(zone, existing);
			group.totalCount += 1;
		}
	}

	const { stackByRowId, zoneStacks } = buildZoneStacks(cardsByZone, groupZones, stackBy);

	// Build sections per zone
	const sections: CardListSection[] = [];

	for (const zone of zones) {
		const cards = cardsByZone[zone] ?? [];
		if (cards.length === 0) continue;

		// One tile per stack; counts keyed by the representative's rowId so two
		// stacks sharing a print id never collide.
		const sectionCards: ResolvedDeckCard[] = [];
		const countById = new Map<string, number>();
		for (const copies of zoneStacks.get(zone) ?? []) {
			const rep = copies[0];
			sectionCards.push(rep);
			countById.set(rep.entry.rowId, copies.length);
		}

		const sortedCards = sortCards(sectionCards);

		const children =
			groupBy === 'type' && zone !== 'commander' && sortedCards.length > 0
				? groupByCardType(sortedCards, countById, cardKey)
				: undefined;

		sections.push({
			// Stable key so the open/collapsed state survives the count changing
			// in the label when cards move between zones.
			key: zone,
			label: `${ZONE_LABELS[zone]} (${cards.length})`,
			cards: sortedCards,
			children,
			border: false,
			background: true,
			defaultCollapsed: zone === 'sideboard' || zone === 'maybeboard',
		});
	}

	return { sections, groupByCardId, stackByRowId };
}

export function useDeckCardSections(
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>,
	showCommander: boolean,
	sortCards: (cards: ResolvedDeckCard[]) => ResolvedDeckCard[] = (c) => c,
	groupBy: DeckGroupBy = 'type',
	stackBy: StackBy = EMPTY_STACK_BY
) {
	return useMemo(
		() => buildDeckCardSections(cardsByZone, showCommander, sortCards, groupBy, stackBy),
		[cardsByZone, showCommander, sortCards, groupBy, stackBy]
	);
}
