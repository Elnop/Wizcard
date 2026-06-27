import assert from 'node:assert';
import { hydrateResolvedMap } from '../../src/lib/scryfall/resolveCardsByScryfallIds';
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

const map = new Map<string, ScryfallCard>([['fr', frNoParts]]);
let cached: ScryfallCard[] = [];
const out = await hydrateResolvedMap(map, {
	fetchByOracleIds: async () => [oracleEn],
	writeCache: async (cards) => {
		cached = cards;
	},
});

assert.ok(out.get('fr')!.all_parts, 'resolved fr card now has all_parts');
assert.strictEqual(cached.length, 1, 'hydrated card written back to cache');
assert.strictEqual(cached[0].id, 'fr', 'cached the hydrated localized card');
console.log('resolveHydration: all assertions passed');
