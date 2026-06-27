import assert from 'node:assert';
import { hydrateAllParts } from '../../src/lib/scryfall/hydrateAllParts';
import type { ScryfallCard } from '../../src/lib/scryfall/types/scryfall';

function card(partial: Partial<ScryfallCard>): ScryfallCard {
	return {
		id: 'x',
		lang: 'en',
		oracle_id: 'o',
		name: 'N',
		printed_name: undefined,
		...partial,
	} as ScryfallCard;
}

// FR card without all_parts + oracle_id → all_parts grafted, identity preserved
const lolthFr = card({
	id: 'lolth-fr',
	lang: 'fr',
	oracle_id: 'lolth-oracle',
	name: 'Lolth',
	printed_name: 'Lolth VF',
	all_parts: undefined,
});
const oracleEn = card({
	id: 'lolth-en',
	lang: 'en',
	oracle_id: 'lolth-oracle',
	all_parts: [
		{
			object: 'related_card',
			id: 'emblem-en',
			component: 'combo_piece',
			name: 'Lolth Emblem',
			type_line: 'Emblem — Lolth',
			uri: '',
		},
	] as never,
});

const out = await hydrateAllParts([lolthFr], { fetchByOracleIds: async () => [oracleEn] });
const hydrated = out.find((c) => c.id === 'lolth-fr')!;
assert.ok(hydrated.all_parts && hydrated.all_parts.length === 1, 'all_parts grafted');
assert.strictEqual(hydrated.printed_name, 'Lolth VF', 'localized identity preserved');
assert.strictEqual(hydrated.lang, 'fr', 'lang preserved');

// EN card or card already having all_parts → no fetch, returned untouched
let called = 0;
const enCard = card({ id: 'en1', lang: 'en' });
const frWithParts = card({ id: 'fr2', lang: 'fr', all_parts: [] as never });
const out2 = await hydrateAllParts([enCard, frWithParts], {
	fetchByOracleIds: async () => {
		called++;
		return [];
	},
});
assert.strictEqual(called, 0, 'no fetch when nothing to hydrate');
assert.strictEqual(out2[0], enCard, 'en card same reference');

// Network failure → cards unchanged, no throw
const out3 = await hydrateAllParts([lolthFr], {
	fetchByOracleIds: async () => {
		throw new Error('network');
	},
});
assert.strictEqual(
	out3.find((c) => c.id === 'lolth-fr')!.all_parts,
	undefined,
	'unchanged on failure'
);

console.log('hydrateAllParts: all assertions passed');
