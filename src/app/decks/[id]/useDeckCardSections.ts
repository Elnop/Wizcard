import { useMemo } from 'react';
import type { Card } from '@/types/cards';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { DeckZone } from '@/types/decks';
import { groupByCardType } from '@/lib/card/utils/group-by-card-type';
import type { ResolvedDeckCard } from './useDeckDetail';

export type DeckCardGroup = {
	representative: Card;
	byZone: Map<DeckZone, Card[]>;
	totalCount: number;
};

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
};

export function useDeckCardSections(
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>,
	showCommander: boolean
) {
	return useMemo(() => {
		const zones: DeckZone[] = showCommander
			? ['commander', 'mainboard', 'sideboard', 'maybeboard']
			: ['mainboard', 'sideboard', 'maybeboard'];

		// Build groupByCardId keyed by oracle_id, accumulating copies per zone
		const groupByCardId = new Map<string, DeckCardGroup>();

		for (const zone of zones) {
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

			const children =
				zone !== 'commander' && sectionCards.length > 0
					? groupByCardType(sectionCards, countById)
					: undefined;

			sections.push({
				label: `${ZONE_LABELS[zone]} (${cards.length})`,
				cards: sectionCards,
				children,
				border: false,
				background: true,
			});
		}

		return { sections, groupByCardId };
	}, [cardsByZone, showCommander]);
}
