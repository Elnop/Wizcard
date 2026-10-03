import type { ScryfallOnlyFields } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder } from '@/lib/scryfall/types/sort';
import type { Card, CardEntry, CardFacets, MtgColor } from '@/types/cards';
import { type CardFilters, DEFAULT_CARD_FILTERS } from '@/lib/search/types';
import type { MtgLanguage } from '@/lib/mtg/languages';
import type { CardType, CustomCard } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';

export type CollectionSortOrder = ScryfallSortOrder | 'language';

/** Anything the collection filters can read: facets, full Cards, custom cards, ± entry. */
type BaseCard = CardFacets | CustomCard;
export type FilterableCard = BaseCard | (BaseCard & { entry: CardEntry });
type WithEntry = BaseCard & { entry: CardEntry };

export interface CollectionFilters extends Omit<CardFilters, 'order'> {
	order: CollectionSortOrder;
	proxyFilter: 'all' | 'official' | 'proxy';
	foilTypeFilter: 'none' | 'all' | 'foil' | 'etched';
	languageFilter: MtgLanguage | 'all' | 'undefined';
	cardTypeFilter: CardType | 'all';
	mpcTagsFilter: string[];
	deckAssignment: 'all' | 'assigned' | 'unassigned';
}

export const defaultCollectionFilters: CollectionFilters = {
	...DEFAULT_CARD_FILTERS,
	order: 'name',
	proxyFilter: 'all',
	foilTypeFilter: 'all',
	languageFilter: 'all',
	cardTypeFilter: 'all',
	mpcTagsFilter: [],
	deckAssignment: 'all',
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
	cardColors: MtgColor[] | undefined,
	selected: MtgColor[],
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

function matchColorIdentity(
	cardColorIdentity: MtgColor[] | undefined,
	selected: MtgColor[],
	mode: 'atMost' | 'exact'
): boolean {
	if (selected.length === 0) return true;
	const identity = cardColorIdentity ?? [];
	if (mode === 'exact') {
		// "Exactly" (ci=): card identity is the same set as the selection.
		return identity.length === selected.length && selected.every((c) => identity.includes(c));
	}
	// "At most" (ci<=): every color of the card's identity must be in the selection.
	return identity.every((c) => selected.includes(c));
}

const RARITY_ORDER: Record<string, number> = {
	common: 0,
	uncommon: 1,
	rare: 2,
	mythic: 3,
	special: 4,
	bonus: 5,
};

export function getSortValue(card: FilterableCard, order: CollectionSortOrder): string | number {
	if (order === 'language') return 'entry' in card ? (card.entry.language ?? '') : '';
	if (order === 'name') return card.name.toLowerCase();
	if (order === 'cmc') return (card as CardFacets).cmc ?? 0;
	if (order === 'rarity') return RARITY_ORDER[(card as CardFacets).rarity ?? ''] ?? 0;
	if (order === 'set')
		return `${(card as CardFacets).set ?? ''}-${(card as CardFacets).collector_number?.padStart(6, '0') ?? ''}`;
	if (order === 'released') return (card as CardFacets).released_at ?? '';
	if (order === 'color') return ((card as CardFacets).colors ?? []).sort().join('');
	if (order === 'usd')
		return parseFloat((card as Partial<Pick<Card, 'prices'>>).prices?.usd ?? '0');
	if (order === 'eur')
		return parseFloat((card as Partial<Pick<Card, 'prices'>>).prices?.eur ?? '0');
	if (order === 'tix')
		return parseFloat((card as Partial<Pick<Card, 'prices'>>).prices?.tix ?? '0');
	if (order === 'power') return parseFloat((card as CardFacets).power ?? '0');
	if (order === 'toughness') return parseFloat((card as CardFacets).toughness ?? '0');
	if (order === 'edhrec') return (card as CardFacets).edhrec_rank ?? 9999999;
	// penny_rank is provider-only (not mirrored by the DB catalog) — narrow boundary read.
	if (order === 'penny') return (card as unknown as ScryfallOnlyFields).penny_rank ?? 9999999;
	if (order === 'artist') return ((card as CardFacets).artist ?? '').toLowerCase();
	return card.name.toLowerCase();
}

function getCardType(card: FilterableCard): CardType {
	if (isCustomCard(card)) {
		return card.custom.card_type;
	}
	const layout = (card as CardFacets).layout;
	if (layout === 'token' || layout === 'double_faced_token') return 'token';
	return 'card';
}

function getCardLang(card: FilterableCard): string | null {
	if (isCustomCard(card)) {
		return card.custom.lang;
	}
	return (card as CardFacets).lang ?? null;
}

function matchesProxyFilter(
	card: WithEntry,
	proxyFilter: CollectionFilters['proxyFilter']
): boolean {
	if (proxyFilter === 'all') return true;
	const isProxy = card.entry.proxy === true;
	if (proxyFilter === 'proxy') return isProxy;
	if (proxyFilter === 'official') return !isProxy;
	return true;
}

function matchesFoilFilter(
	card: WithEntry,
	foilTypeFilter: CollectionFilters['foilTypeFilter']
): boolean {
	if (foilTypeFilter === 'all') return true;
	const ft = card.entry.foilType;
	if (foilTypeFilter === 'none') return ft === undefined;
	if (foilTypeFilter === 'foil') return ft === 'foil';
	if (foilTypeFilter === 'etched') return ft === 'etched';
	return true;
}

function matchesLanguageFilter(
	card: FilterableCard,
	languageFilter: CollectionFilters['languageFilter']
): boolean {
	if (languageFilter === 'all') return true;

	// For a collection entry, only the language the user recorded counts. The
	// resolved Scryfall print always carries a `lang`, so falling back to it
	// would mean no entry is ever "undefined".
	if ('entry' in card) {
		const entryLanguage = (card as WithEntry).entry.language;
		if (languageFilter === 'undefined') return !entryLanguage;
		return entryLanguage === languageFilter;
	}

	const cardLang = getCardLang(card);
	if (languageFilter === 'undefined') return !cardLang;
	return cardLang === languageFilter;
}

function matchesCardTypeFilter(
	card: FilterableCard,
	cardTypeFilter: CollectionFilters['cardTypeFilter']
): boolean {
	if (cardTypeFilter === 'all') return true;
	return getCardType(card) === cardTypeFilter;
}

function matchesMpcTagsFilter(card: FilterableCard, mpcTagsFilter: string[]): boolean {
	if (mpcTagsFilter.length === 0) return true;
	if (!isCustomCard(card)) return true;
	const tags = card.custom.tags;
	return mpcTagsFilter.every((t) => tags.includes(t));
}

function matchesOracleText(card: CardFacets, oracleText: string): boolean {
	if (!oracleText) return true;
	const tokens = parseOracleTokens(oracleText);
	if (tokens.length === 0) return true;
	const text = card.oracle_text?.toLowerCase() ?? '';
	return tokens.every((t) => text.includes(t));
}

function matchesType(typeLine: string | undefined, types: string[]): boolean {
	if (types.length === 0) return true;
	const tl = (typeLine ?? '').toLowerCase();
	return types.every((t) => tl.includes(t.toLowerCase()));
}

function cardMatchesFilters(
	card: FilterableCard,
	filters: CollectionFilters,
	cmcTest: ((v: number) => boolean) | null
): boolean {
	if (filters.name && !card.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
	if (!matchColors(card.colors, filters.colors, filters.colorMatch)) return false;
	if (
		!matchColorIdentity(
			(card as CardFacets).color_identity,
			filters.colorIdentity,
			filters.colorIdentityMatch
		)
	)
		return false;
	if (!matchesType(card.type_line, filters.type)) return false;
	if (filters.set && card.set !== filters.set) return false;
	if (
		filters.rarities.length > 0 &&
		card.rarity !== undefined &&
		!filters.rarities.includes(card.rarity)
	)
		return false;
	if (!matchesOracleText(card as CardFacets, filters.oracleText)) return false;
	if (cmcTest && card.cmc !== undefined && !cmcTest(card.cmc)) return false;
	if ('entry' in card) {
		if (!matchesProxyFilter(card, filters.proxyFilter)) return false;
		if (!matchesFoilFilter(card, filters.foilTypeFilter)) return false;
	}
	if (!matchesLanguageFilter(card, filters.languageFilter)) return false;
	if (!matchesCardTypeFilter(card, filters.cardTypeFilter)) return false;
	if (!matchesMpcTagsFilter(card, filters.mpcTagsFilter)) return false;
	return true;
}

export function filterCollectionCards<T extends FilterableCard>(
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
