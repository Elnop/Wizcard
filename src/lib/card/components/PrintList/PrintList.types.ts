import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardListSection, AnyCard } from '@/lib/card/components/CardList/CardList.types';

export interface CollectionCopyEntry {
	rowId: string;
	scryfallId: string;
	condition?: string;
	isFoil?: boolean;
	language?: string;
}

export interface PrintListProps {
	prints_search_uri: string;
	currentCardId: string;
	currentSet?: string;
	currentCollectorNumber?: string;
	currentLang?: string;
	onSelect: (print: ScryfallCard) => void;
	collectionCopies?: CollectionCopyEntry[];
	onSelectCollectionCopy?: (rowId: string) => void;
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
