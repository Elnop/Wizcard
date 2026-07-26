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

/**
 * Type line vocabulary, split by role instead of flattened.
 *
 * getAllCardTypes() merges everything into one list, which is what the search
 * filter needs (`t:` matches any of them). Composing a type line needs the
 * distinction: supertypes come first, then types, then subtypes after the dash.
 *
 * Counts as of the current catalogs: 7 supertypes, 19 types, 488 subtypes.
 */
export interface CardTypeVocabulary {
	supertypes: string[];
	types: string[];
	subtypes: string[];
}

const SUBTYPE_CATALOGS: ScryfallCatalogType[] = [
	'creature-types',
	'planeswalker-types',
	'land-types',
	'artifact-types',
	'enchantment-types',
	'spell-types',
];

export async function getCardTypeVocabulary(): Promise<CardTypeVocabulary> {
	const [supertypes, types, ...subtypeLists] = await Promise.all([
		getCatalog('supertypes'),
		getCatalog('card-types'),
		...SUBTYPE_CATALOGS.map((name) => getCatalog(name)),
	]);
	const subtypes = [...new Set(subtypeLists.flat())].sort((a, b) => a.localeCompare(b));
	return { supertypes, types, subtypes };
}
