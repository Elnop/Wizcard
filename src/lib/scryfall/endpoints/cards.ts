// Scryfall card search and retrieval functions

import { scryfallGet, scryfallPost } from '../fetcher';
import type {
	ScryfallCard,
	ScryfallCardSearchResult,
	ScryfallCatalog,
	ScryfallList,
	ScryfallUUID,
	ScryfallCardIdentifier,
} from '../types/scryfall';
import type { ScryfallSearchParams } from '../types/api';

export async function searchCards(params: ScryfallSearchParams): Promise<ScryfallCardSearchResult> {
	const queryParams: Record<string, string> = { q: params.q };

	if (params.unique) queryParams.unique = params.unique;
	if (params.order) queryParams.order = params.order;
	if (params.dir) queryParams.dir = params.dir;
	if (params.include_extras !== undefined)
		queryParams.include_extras = String(params.include_extras);
	if (params.include_multilingual !== undefined)
		queryParams.include_multilingual = String(params.include_multilingual);
	if (params.include_variations !== undefined)
		queryParams.include_variations = String(params.include_variations);
	if (params.page) queryParams.page = String(params.page);
	if (params.format) queryParams.format = params.format;

	return scryfallGet<ScryfallCardSearchResult>('/cards/search', queryParams);
}

export async function getCardByName(name: string, set?: string): Promise<ScryfallCard> {
	const params: Record<string, string> = { exact: name };
	if (set) params.set = set;
	return scryfallGet<ScryfallCard>('/cards/named', params);
}

export async function fuzzySearchCard(name: string, set?: string): Promise<ScryfallCard> {
	const params: Record<string, string> = { fuzzy: name };
	if (set) params.set = set;
	return scryfallGet<ScryfallCard>('/cards/named', params);
}

export async function autocompleteCards(
	query: string,
	includeExtras: boolean = false
): Promise<ScryfallCatalog> {
	const params: Record<string, string> = { q: query };
	if (includeExtras) params.include_extras = 'true';
	return scryfallGet<ScryfallCatalog>('/cards/autocomplete', params);
}

export async function randomCard(query?: string): Promise<ScryfallCard> {
	const params: Record<string, string> = {};
	if (query) params.q = query;
	return scryfallGet<ScryfallCard>('/cards/random', params);
}

export async function getCardCollection(
	identifiers: ScryfallCardIdentifier[]
): Promise<ScryfallList<ScryfallCard>> {
	return scryfallPost<ScryfallList<ScryfallCard>>('/cards/collection', { identifiers });
}

export async function getCardById(id: ScryfallUUID): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/${id}`);
}

export async function getCardBySetNumber(
	setCode: string,
	collectorNumber: string
): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/${setCode}/${collectorNumber}`);
}

export async function getCardBySetNumberAndLang(
	setCode: string,
	collectorNumber: string,
	lang: string
): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/${setCode}/${collectorNumber}/${lang}`);
}

export async function getCardByMultiverseId(id: number): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/multiverse/${id}`);
}

export async function getCardByMtgoId(id: number): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/mtgo/${id}`);
}

export async function getCardByArenaId(id: number): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/arena/${id}`);
}

export async function getCardByTcgplayerId(id: number): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/tcgplayer/${id}`);
}

export async function getCardByCardmarketId(id: number): Promise<ScryfallCard> {
	return scryfallGet<ScryfallCard>(`/cards/cardmarket/${id}`);
}

// Fetch all pages of a search result
export async function searchAllCards(params: ScryfallSearchParams): Promise<ScryfallCard[]> {
	const allCards: ScryfallCard[] = [];
	let hasMore = true;
	let page = 1;

	while (hasMore) {
		const result = await searchCards({ ...params, page });
		allCards.push(...result.data);
		hasMore = result.has_more;
		page++;

		// Safety limit to prevent infinite loops
		if (page > 1000) break;
	}

	return allCards;
}

// Count search results without fetching all data
export async function countCardSearch(query: string): Promise<number> {
	const result = await searchCards({ q: query, page: 1 });
	return result.total_cards ?? result.data.length;
}

// Fetch all prints of a card using its prints_search_uri (a full Scryfall URL)
export async function getCardPrints(prints_search_uri: string): Promise<ScryfallCard[]> {
	const allCards: ScryfallCard[] = [];
	const base = 'https://api.scryfall.com';

	const firstUrl = new URL(prints_search_uri);
	firstUrl.searchParams.set('include_multilingual', 'true');
	let nextUrl: string | null = firstUrl.toString();

	while (nextUrl) {
		const path: string = nextUrl.startsWith(base) ? nextUrl.slice(base.length) : nextUrl;
		const result = await scryfallGet<ScryfallCardSearchResult>(path);
		allCards.push(...result.data);
		nextUrl = result.has_more && result.next_page ? result.next_page : null;

		if (allCards.length > 10000) break;
	}

	return allCards;
}
