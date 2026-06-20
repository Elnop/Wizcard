import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardListSection, AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { Card } from '@/types/cards';

export interface CollectionCopyEntry {
	rowId: string;
	scryfallId: string;
	condition?: string;
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	proxy?: boolean;
	language?: string;
	/** Name of the deck this copy is assigned to (any deck), for the "Utilisé" badge. */
	assignedToDeckName?: string;
	/** True when this copy is assigned to the deck currently being edited. */
	isCurrentDeck?: boolean;
}

export interface PrintListProps {
	prints_search_uri: string;
	currentCardId: string;
	currentSet?: string;
	currentCollectorNumber?: string;
	currentLang?: string;
	onSelect: (print: ScryfallCard) => void;
}

const LANG_DISPLAY_FR = new Intl.DisplayNames('fr', { type: 'language' });

export function getLangLabel(lang: string, count: number): string {
	const name = LANG_DISPLAY_FR.of(lang) ?? lang.toUpperCase();
	return `${name.charAt(0).toUpperCase() + name.slice(1)} (${count})`;
}

export function groupPrintsByLang(prints: ScryfallCard[], currentLang: string): CardListSection[] {
	const map = new Map<string, ScryfallCard[]>();
	for (const print of prints) {
		const group = map.get(print.lang) ?? [];
		group.push(print);
		map.set(print.lang, group);
	}

	const entries = [...map.entries()];
	entries.sort(([a], [b]) => {
		if (a === currentLang) return -1;
		if (b === currentLang) return 1;
		return getLangLabel(a, 0).localeCompare(getLangLabel(b, 0), 'fr');
	});

	return entries.map(([lang, cards]) => ({
		label: getLangLabel(lang, cards.length),
		cards: cards as AnyCard[],
	}));
}

export function groupCollectionByPrint(
	copies: CollectionCopyEntry[],
	printMap: Map<string, ScryfallCard>
): CardListSection[] {
	const byPrint = new Map<string, CollectionCopyEntry[]>();
	const orphans: CollectionCopyEntry[] = [];

	for (const copy of copies) {
		if (printMap.has(copy.scryfallId)) {
			const group = byPrint.get(copy.scryfallId) ?? [];
			group.push(copy);
			byPrint.set(copy.scryfallId, group);
		} else {
			orphans.push(copy);
		}
	}

	// Stable ordering: by set name, then collector number, then rowId.
	const orderedPrints = [...byPrint.entries()].sort(([aId], [bId]) => {
		const a = printMap.get(aId)!;
		const b = printMap.get(bId)!;
		return (
			a.set_name.localeCompare(b.set_name, 'fr') ||
			a.collector_number.localeCompare(b.collector_number, 'en', { numeric: true })
		);
	});

	const sections: CardListSection[] = [];

	for (const [scryfallId, group] of orderedPrints) {
		const scryfallCard = printMap.get(scryfallId)!;
		const orderedGroup = [...group].sort((a, b) => a.rowId.localeCompare(b.rowId));
		sections.push({
			label: `${scryfallCard.set_name} #${scryfallCard.collector_number} (${group.length})`,
			cards: orderedGroup.map((copy) => {
				const card: Card = {
					...scryfallCard,
					entry: {
						rowId: copy.rowId,
						dateAdded: '',
						condition: (copy.condition as Card['entry']['condition']) ?? 'NM',
						isFoil: copy.isFoil,
						foilType: copy.foilType,
						proxy: copy.proxy,
						language: copy.language as Card['entry']['language'],
					},
				};
				return card as AnyCard;
			}),
		});
	}

	if (orphans.length > 0) {
		sections.push({ label: `Autres éditions (${orphans.length})`, cards: [] });
	}

	return sections;
}
