import assert from 'node:assert';
import { hydrateCardsAllParts } from '../../src/lib/scryfall/hydrateAllParts';
import type { ScryfallCard } from '../../src/lib/scryfall/types/scryfall';

const frNoParts = { id: 'fr', lang: 'fr', oracle_id: 'o', name: 'N' } as ScryfallCard;
const oracleEn = {
	id: 'en',
	lang: 'en',
	oracle_id: 'o',
	name: 'N',
	all_parts: [
		{
			object: 'related_card',
			id: 'tok',
			component: 'token',
			name: 'T',
			type_line: 'Token Creature',
			uri: '',
		},
	],
} as ScryfallCard;

// FR card without all_parts → hydrated, and the enriched card written back to cache.
let cached: ScryfallCard[] = [];
const out = await hydrateCardsAllParts([frNoParts], {
	fetchByOracleIds: async () => [oracleEn],
	writeCache: async (cards) => {
		cached = cards;
	},
});

assert.ok(out[0].all_parts, 'fr card now has all_parts');
assert.strictEqual(out[0].id, 'fr', 'identity preserved (still the fr card)');
assert.strictEqual(cached.length, 1, 'only the hydrated card written back to cache');
assert.strictEqual(cached[0].id, 'fr', 'cached the hydrated localized card');

// Nothing to hydrate → no cache write.
let called = 0;
const enCard = { id: 'en1', lang: 'en', oracle_id: 'o2', name: 'E' } as ScryfallCard;
const out2 = await hydrateCardsAllParts([enCard], {
	fetchByOracleIds: async () => [oracleEn],
	writeCache: async () => {
		called++;
	},
});
assert.strictEqual(out2[0], enCard, 'en card returned unchanged (same reference)');
assert.strictEqual(called, 0, 'no cache write when nothing hydrated');

console.log('hydrateCardsAllParts: all assertions passed');
