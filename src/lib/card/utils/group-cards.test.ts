import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry, FacetCopy } from '@/types/cards';
import { groupByStack, stackKeyOf, filterStacks } from '@/lib/card/utils/group-cards';
import { defaultCollectionFilters } from '@/lib/card/utils/filterCollectionCards';

let n = 0;
function copy(
	over: { id?: string; oracle_id?: string; name?: string; lang?: string } = {},
	entry: Partial<CardEntry> = {}
): FacetCopy {
	n += 1;
	return {
		id: over.id ?? 'print-a',
		oracle_id: over.oracle_id ?? 'oracle-sol-ring',
		name: over.name ?? 'Sol Ring',
		lang: over.lang ?? 'en',
		layout: 'normal',
		set: 'c21',
		collector_number: '263',
		rarity: 'uncommon',
		released_at: '2021-04-23',
		artist: 'Mike Bierek',
		promo: false,
		digital: false,
		cmc: 1,
		colors: [],
		color_identity: [],
		type_line: 'Artifact',
		oracle_text: '{T}: Add {C}{C}.',
		entry: { rowId: `row-${n}`, dateAdded: `2026-01-0${(n % 9) + 1}T00:00:00Z`, ...entry },
	} as FacetCopy;
}

test('by name (default) groups all prints of a card together', () => {
	const stacks = groupByStack([copy({ id: 'print-a' }), copy({ id: 'print-b' })]);
	assert.equal(stacks.length, 1);
	assert.equal(stacks[0].cards.length, 2);
	assert.equal(stacks[0].key, 'oracle-sol-ring');
});

test('print criterion splits by printing', () => {
	const stacks = groupByStack([copy({ id: 'print-a' }), copy({ id: 'print-b' })], ['print']);
	assert.equal(stacks.length, 2);
});

test('finish: unset isFoil stacks with explicit non-foil; foil and etched split', () => {
	const stacks = groupByStack(
		[
			copy({}, {}),
			copy({}, { isFoil: false }),
			copy({}, { isFoil: true }),
			copy({}, { isFoil: true, foilType: 'etched' }),
		],
		['finish']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1, 1]
	);
});

test('condition: unset stacks with NM', () => {
	const stacks = groupByStack(
		[copy({}, {}), copy({}, { condition: 'NM' }), copy({}, { condition: 'LP' })],
		['condition']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1]
	);
});

test('language: unset entry language falls back to the print language (code → name)', () => {
	// entry.language holds MtgLanguage names ('French'); prints carry Scryfall codes ('fr').
	const stacks = groupByStack(
		[copy({ lang: 'fr' }, {}), copy({}, { language: 'French' }), copy({}, { language: 'German' })],
		['language']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1]
	);
});

test('flags: proxy/alter/forTrade combination splits, absent = false', () => {
	const stacks = groupByStack(
		[
			copy({}, {}),
			copy({}, { proxy: false }),
			copy({}, { proxy: true }),
			copy({}, { alter: true }),
		],
		['flags']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1, 1]
	);
});

test('criteria order does not change the key', () => {
	const c = copy({}, { isFoil: true, condition: 'LP' });
	assert.equal(stackKeyOf(c, ['finish', 'condition']), stackKeyOf(c, ['condition', 'finish']));
});

test("'copy' gives one stack per physical copy", () => {
	const a = copy();
	const b = copy();
	const stacks = groupByStack([a, b], 'copy');
	assert.equal(stacks.length, 2);
	assert.equal(stacks[0].key, a.entry.rowId);
});

test('language: English print with no entry language stacks with explicit English', () => {
	const stacks = groupByStack(
		[copy({ lang: 'en' }, {}), copy({}, { language: 'English' })],
		['language']
	);
	assert.equal(stacks.length, 1);
});

test('different cards never stack together, whatever the criteria', () => {
	const stacks = groupByStack(
		[copy(), copy({ oracle_id: 'oracle-other', name: 'Arcane Signet' })],
		[]
	);
	assert.equal(stacks.length, 2);
});

test('filterStacks keeps two stacks of the same card (no oracle collision)', () => {
	const stacks = groupByStack(
		[copy({}, { isFoil: true }), copy({}, { isFoil: false })],
		['finish']
	);
	const filtered = filterStacks(stacks, defaultCollectionFilters);
	assert.equal(filtered.length, 2);
	assert.notEqual(filtered[0].key, filtered[1].key);
});
