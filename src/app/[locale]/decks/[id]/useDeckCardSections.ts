import { useMemo } from 'react';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { DeckZone, DeckCardGroup } from '@/types/decks';
import { groupByCardType } from '@/lib/card/utils/group-by-card-type';
import type { ResolvedDeckCard } from './useDeckDetail';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

export type DeckGroupBy = 'type' | 'none';

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

export function useDeckCardSections(
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>,
	showCommander: boolean,
	sortCards: (cards: ResolvedDeckCard[]) => ResolvedDeckCard[] = (c) => c,
	groupBy: DeckGroupBy = 'type'
) {
	return useMemo(() => {
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

		// Build sections per zone
		const sections: CardListSection[] = [];

		for (const zone of zones) {
			const cards = cardsByZone[zone] ?? [];
			if (cards.length === 0) continue;

			// Deduplicate by oracle_id, keep one representative per group per zone
			const seen = new Set<string>();
			const sectionCards: ResolvedDeckCard[] = [];
			const countById = new Map<string, number>();

			for (const rc of cards) {
				const key = rc.oracle_id ?? rc.id;
				if (seen.has(key)) continue;
				seen.add(key);
				const group = groupByCardId.get(key)!;
				// Use the first copy of this zone so entry.tags reflects the correct zone
				const sectionRep = (group.byZone.get(zone)?.[0] ??
					group.representative) as ResolvedDeckCard;
				sectionCards.push(sectionRep);
				countById.set(sectionRep.id, group.byZone.get(zone)?.length ?? 0);
			}

			const sortedCards = sortCards(sectionCards);

			const children =
				groupBy === 'type' && zone !== 'commander' && sortedCards.length > 0
					? groupByCardType(sortedCards, countById)
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

		return { sections, groupByCardId };
	}, [cardsByZone, showCommander, sortCards, groupBy]);
}
