import { useMemo } from 'react';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '../useDeckDetail';
import { groupByCardType } from '@/lib/card/utils/groupByCardType';

export type DeckCardGroup = {
	representative: ResolvedDeckCard;
	allCopies: ResolvedDeckCard[];
	count: number;
	zone: DeckZone;
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

		const sections: CardListSection[] = [];
		const groupByCardId = new Map<string, DeckCardGroup>();

		for (const zone of zones) {
			const cards = cardsByZone[zone] ?? [];
			if (cards.length === 0) continue;

			// Group by oracle_id (per AGENTS.md: never group by scryfallId)
			const grouped = new Map<string, ResolvedDeckCard[]>();
			for (const rc of cards) {
				const key = rc.card.oracle_id ?? rc.card.id;
				const existing = grouped.get(key);
				if (existing) {
					existing.push(rc);
				} else {
					grouped.set(key, [rc]);
				}
			}

			const sectionCards = [...grouped.values()].map((copies) => {
				const representative = copies[0];
				groupByCardId.set(representative.card.id, {
					representative,
					allCopies: copies,
					count: copies.length,
					zone,
				});
				return representative.card;
			});

			const children =
				zone !== 'commander' && sectionCards.length > 0 ? groupByCardType(sectionCards) : undefined;

			sections.push({
				label: `${ZONE_LABELS[zone]} (${cards.length})`,
				cards: sectionCards,
				children,
			});
		}

		return { sections, groupByCardId };
	}, [cardsByZone, showCommander]);
}
