import assert from 'node:assert';
import { localizeTokens } from '../../src/lib/scryfall/localizeTokens';
import type { ScryfallCard } from '../../src/lib/scryfall/types/scryfall';

const spiderEn = {
	id: 'spider-en',
	lang: 'en',
	set: 'afr',
	collector_number: '12',
	name: 'Spider',
	printed_name: undefined,
} as ScryfallCard;
const spiderFr = {
	id: 'spider-fr',
	lang: 'fr',
	set: 'afr',
	collector_number: '12',
	name: 'Spider',
	printed_name: 'Araignée',
} as ScryfallCard;

// Source lang fr + localized print exists → fr token
const out1 = await localizeTokens([spiderEn], new Map([['spider-en', 'fr']]), {
	fetchLocalized: async () => spiderFr,
});
assert.strictEqual(out1[0].id, 'spider-fr', 'returns fr print');
assert.strictEqual(out1[0].printed_name, 'Araignée', 'localized name');

// Localized print 404 → fallback to EN token
const out2 = await localizeTokens([spiderEn], new Map([['spider-en', 'fr']]), {
	fetchLocalized: async () => {
		throw new Error('404');
	},
});
assert.strictEqual(out2[0].id, 'spider-en', 'fallback to en token');

// Source lang en → no fetch, original token
let called = 0;
const out3 = await localizeTokens([spiderEn], new Map([['spider-en', 'en']]), {
	fetchLocalized: async () => {
		called++;
		return spiderFr;
	},
});
assert.strictEqual(called, 0, 'no fetch for en source');
assert.strictEqual(out3[0].id, 'spider-en', 'en source unchanged');

console.log('localizeTokens: all assertions passed');
