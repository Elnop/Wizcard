import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder } from '@/lib/scryfall/types/sort';
import type { Card } from '@/types/cards';
import { type CardFilters, DEFAULT_CARD_FILTERS } from '@/lib/search/types';

export type CollectionSortOrder = ScryfallSortOrder | 'language';

export interface CollectionFilters extends Omit<CardFilters, 'order'> {
	order: CollectionSortOrder;
	proxyFilter: 'all' | 'official' | 'proxy';
	foilTypeFilter: 'none' | 'all' | 'foil' | 'etched';
}

export const defaultCollectionFilters: CollectionFilters = {
	...DEFAULT_CARD_FILTERS,
	order: 'name',
	proxyFilter: 'all',
	foilTypeFilter: 'all',
};

function parseCmc(raw: string): ((cmc: number) => boolean) | null {
	if (!raw) return null;
	const match = raw.match(/^(>=|<=|>|<|:)?(\d+)$/);
	if (!match) return null;
	const op = match[1] ?? ':';
	const num = parseInt(match[2], 10);
	switch (op) {
		case '>=':
			return (c) => c >= num;
		case '<=':
			return (c) => c <= num;
		case '>':
			return (c) => c > num;
		case '<':
			return (c) => c < num;
		default:
			return (c) => c === num;
	}
}

function parseOracleTokens(raw: string): string[] {
	// Normalize all quote variants to ASCII double-quote
	const normalized = raw.replace(/["“”]/g, '"');
	const tokens: string[] = [];
	const re = /"([^"]*)"?|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(normalized)) !== null) {
		// match[1]: inside quotes (closed or unclosed), match[2]: bare word
		const token = (match[1] ?? match[2]).replace(/"/g, '').trim().toLowerCase();
		if (token) tokens.push(token);
	}
	return tokens;
}

function matchColors(
	cardColors: ScryfallColor[] | undefined,
	selected: ScryfallColor[],
	mode: 'exact' | 'include' | 'atMost'
): boolean {
	if (selected.length === 0) return true;
	const colors = cardColors ?? [];
	switch (mode) {
		case 'exact':
			return colors.length === selected.length && selected.every((c) => colors.includes(c));
		case 'include':
			return selected.every((c) => colors.includes(c));
		case 'atMost':
			return colors.every((c) => selected.includes(c));
	}
}

const RARITY_ORDER: Record<string, number> = {
	common: 0,
	uncommon: 1,
	rare: 2,
	mythic: 3,
	special: 4,
	bonus: 5,
};

export function getSortValue(
	card: ScryfallCard | Card,
	order: CollectionSortOrder
): string | number {
	if (order === 'language') return 'entry' in card ? (card.entry.language ?? '') : '';
	if (order === 'name') return card.name.toLowerCase();
	if (order === 'cmc') return card.cmc;
	if (order === 'rarity') return RARITY_ORDER[card.rarity] ?? 0;
	if (order === 'set') return `${card.set}-${card.collector_number.padStart(6, '0')}`;
	if (order === 'released') return card.released_at;
	if (order === 'color') return (card.colors ?? []).sort().join('');
	if (order === 'usd') return parseFloat(card.prices.usd ?? '0');
	if (order === 'eur') return parseFloat(card.prices.eur ?? '0');
	if (order === 'tix') return parseFloat(card.prices.tix ?? '0');
	if (order === 'power') return parseFloat(card.power ?? '0');
	if (order === 'toughness') return parseFloat(card.toughness ?? '0');
	if (order === 'edhrec') return card.edhrec_rank ?? 9999999;
	if (order === 'penny') return card.penny_rank ?? 9999999;
	if (order === 'artist') return (card.artist ?? '').toLowerCase();
	return card.name.toLowerCase();
}

function matchesProxyFilter(card: Card, proxyFilter: CollectionFilters['proxyFilter']): boolean {
	if (proxyFilter === 'all') return true;
	const isProxy = card.entry.proxy === true;
	if (proxyFilter === 'proxy') return isProxy;
	if (proxyFilter === 'official') return !isProxy;
	return true;
}

function matchesFoilFilter(
	card: Card,
	foilTypeFilter: CollectionFilters['foilTypeFilter']
): boolean {
	if (foilTypeFilter === 'all') return true;
	const ft = card.entry.foilType;
	if (foilTypeFilter === 'none') return ft === undefined;
	if (foilTypeFilter === 'foil') return ft === 'foil';
	if (foilTypeFilter === 'etched') return ft === 'etched';
	return true;
}

function matchesOracleText(card: ScryfallCard, oracleText: string): boolean {
	if (!oracleText) return true;
	const tokens = parseOracleTokens(oracleText);
	if (tokens.length === 0) return true;
	const text = card.oracle_text?.toLowerCase() ?? '';
	return tokens.every((t) => text.includes(t));
}

function cardMatchesFilters(
	card: ScryfallCard | Card,
	filters: CollectionFilters,
	cmcTest: ((v: number) => boolean) | null
): boolean {
	if (filters.name && !card.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
	if (!matchColors(card.colors, filters.colors, filters.colorMatch)) return false;
	if (filters.type && !card.type_line.toLowerCase().includes(filters.type.toLowerCase()))
		return false;
	if (filters.set && card.set !== filters.set) return false;
	if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
	if (!matchesOracleText(card, filters.oracleText)) return false;
	if (cmcTest && !cmcTest(card.cmc)) return false;
	if ('entry' in card) {
		if (!matchesProxyFilter(card, filters.proxyFilter)) return false;
		if (!matchesFoilFilter(card, filters.foilTypeFilter)) return false;
	}
	return true;
}

export function filterCollectionCards<T extends ScryfallCard | Card>(
	cards: T[],
	filters: CollectionFilters
): T[] {
	const cmcTest = parseCmc(filters.cmc);
	const filtered = cards.filter((card) => cardMatchesFilters(card, filters, cmcTest));

	if (filtered.length <= 1) return filtered;

	return [...filtered].sort((a, b) => {
		const av = getSortValue(a, filters.order);
		const bv = getSortValue(b, filters.order);
		const cmp =
			typeof av === 'number' && typeof bv === 'number'
				? av - bv
				: String(av).localeCompare(String(bv));
		// 'auto' behaves like 'asc' for local filtering
		return filters.dir === 'desc' ? -cmp : cmp;
	});
}
