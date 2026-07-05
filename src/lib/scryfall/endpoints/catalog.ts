// Scryfall catalog functions (type/subtype name lists)

import { scryfallGet } from '../utils/fetcher';
import type { ScryfallCatalogType } from '../types/api';
import type { ScryfallCatalog } from '../types/scryfall';

// All catalogs that contribute card types and subtypes. Combining them gives the full
// set of values usable with Scryfall's `t:` operator (main types + creature/land/etc. subtypes).
const TYPE_CATALOGS: ScryfallCatalogType[] = [
	'card-types',
	'supertypes',
	'creature-types',
	'planeswalker-types',
	'land-types',
	'artifact-types',
	'enchantment-types',
	'spell-types',
];

export async function getCatalog(name: ScryfallCatalogType): Promise<string[]> {
	const result = await scryfallGet<ScryfallCatalog>(`/catalog/${name}`);
	return result.data;
}

export async function getAllCardTypes(): Promise<string[]> {
	const lists = await Promise.all(TYPE_CATALOGS.map((name) => getCatalog(name)));
	// A value can appear in multiple catalogs (e.g. shared subtypes); dedupe and sort.
	const unique = new Set(lists.flat());
	return [...unique].sort((a, b) => a.localeCompare(b));
}
