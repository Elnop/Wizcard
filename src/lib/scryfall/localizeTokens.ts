import { getLocalizedPrint } from '@/lib/scryfall/getLocalizedPrint';
import type { Card } from '@/types/cards';

/**
 * Re-resolve each resolved (English) token print into the language of the card
 * that produces it. `langByTokenId` maps token print id → Scryfall lang code
 * (e.g. `'fr'`). Tokens whose source language is English (or `undefined`) are
 * left untouched. When the localized print does not exist (404) or the fetch
 * fails, the English token is kept (fallback) — we never drop a token.
 */
// Generic over the token shape: a token is either passed through unchanged or replaced by a
// localized print, so callers holding domain `Card` (or `Card | CustomCard`) keep their type.
// Only id/set/collector_number are read — all domain fields.
export async function localizeTokens<
	T extends { id: string; set?: string; collector_number?: string },
>(
	tokens: T[],
	langByTokenId: Map<string, string>,
	deps: { fetchLocalized?: (set: string, num: string, lang: string) => Promise<Card> } = {}
): Promise<(T | Card)[]> {
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

function defaultFetchLocalized(set: string, num: string, lang: string): Promise<Card> {
	return getLocalizedPrint(set, num, lang).then((card) => {
		if (!card) throw new Error('localized print not found');
		return card;
	});
}
