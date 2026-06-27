import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/**
 * Re-resolve each resolved (English) token print into the language of the card
 * that produces it. `langByTokenId` maps token print id → Scryfall lang code
 * (e.g. `'fr'`). Tokens whose source language is English (or `undefined`) are
 * left untouched. When the localized print does not exist (404) or the fetch
 * fails, the English token is kept (fallback) — we never drop a token.
 */
export async function localizeTokens(
	tokens: ScryfallCard[],
	langByTokenId: Map<string, string>,
	deps: { fetchLocalized?: (set: string, num: string, lang: string) => Promise<ScryfallCard> } = {}
): Promise<ScryfallCard[]> {
	const fetchLocalized = deps.fetchLocalized ?? defaultFetchLocalized;

	return Promise.all(
		tokens.map(async (token) => {
			const lang = langByTokenId.get(token.id);
			if (!lang || lang === 'en' || !token.set || !token.collector_number) return token;
			try {
				return await fetchLocalized(token.set, token.collector_number, lang);
			} catch {
				return token; // fallback to English print
			}
		})
	);
}

function defaultFetchLocalized(set: string, num: string, lang: string): Promise<ScryfallCard> {
	return getCardBySetNumberAndLang(set, num, lang);
}
