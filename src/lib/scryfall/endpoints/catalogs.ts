/**
 * Scryfall catalog access functions.
 *
 * Not yet consumed in the app — kept for future use.
 */

import { scryfallGet } from '../utils/fetcher';
import type { ScryfallCatalog } from '../types/scryfall';
import type { ScryfallCatalogType } from '../types/api';

export async function getCardNames(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/card-names');
}

export async function getArtistNames(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/artist-names');
}

export async function getKeywordAbilities(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/keyword-abilities');
}

export async function getKeywordActions(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/keyword-actions');
}

export async function getAbilityWords(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/ability-words');
}

export async function getFlavorWords(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/flavor-words');
}

export async function getCardTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/card-types');
}

export async function getSpellTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/spell-types');
}

export async function getCreatureTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/creature-types');
}

export async function getPlaneswalkerTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/planeswalker-types');
}

export async function getLandTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/land-types');
}

export async function getEnchantmentTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/enchantment-types');
}

export async function getArtifactTypes(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/artifact-types');
}

export async function getPowers(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/powers');
}

export async function getToughnesses(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/toughnesses');
}

export async function getLoyalties(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/loyalties');
}

export async function getWatermarks(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/watermarks');
}

export async function getWordBank(): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>('/catalog/word-bank');
}

export async function getCatalogByType(type: ScryfallCatalogType): Promise<ScryfallCatalog> {
	return scryfallGet<ScryfallCatalog>(`/catalog/${type}`);
}

export async function searchInCatalog(
	catalogType: ScryfallCatalogType,
	searchTerm: string,
	exact: boolean = false
): Promise<string[]> {
	const catalog = await getCatalogByType(catalogType);
	const term = searchTerm.toLowerCase();

	if (exact) {
		return catalog.data.filter((item) => item.toLowerCase() === term);
	}
	return catalog.data.filter((item) => item.toLowerCase().includes(term));
}

export async function existsInCatalog(
	catalogType: ScryfallCatalogType,
	value: string
): Promise<boolean> {
	const results = await searchInCatalog(catalogType, value, true);
	return results.length > 0;
}

export async function getSuggestions(
	catalogType: ScryfallCatalogType,
	partialInput: string,
	limit: number = 10
): Promise<string[]> {
	const catalog = await getCatalogByType(catalogType);
	const term = partialInput.toLowerCase();

	// Prioritize matches that start with the search term
	const startsWith = catalog.data.filter((item) => item.toLowerCase().startsWith(term));
	const contains = catalog.data.filter(
		(item) => item.toLowerCase().includes(term) && !item.toLowerCase().startsWith(term)
	);

	return [...startsWith, ...contains].slice(0, limit);
}
