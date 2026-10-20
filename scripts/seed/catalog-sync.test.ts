import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefinitionSelector, groupPrintsByFaceCount } from './catalog-sync';
import type { CardDefinitionFaceRow, CardDefinitionRow } from './normalize-catalog-card';

function def(oracle_id: string, oldschool: string): CardDefinitionRow {
	return {
		oracle_id,
		name: 'Card',
		type_line: null,
		oracle_text: null,
		mana_cost: null,
		cmc: null,
		colors: null,
		color_identity: null,
		keywords: null,
		power: null,
		toughness: null,
		loyalty: null,
		defense: null,
		legalities: { oldschool },
		reserved: null,
		edhrec_rank: null,
		layout: null,
	};
}

function face(oracle_id: string, face_index: number, name: string): CardDefinitionFaceRow {
	return {
		oracle_id,
		face_index,
		name,
		type_line: null,
		oracle_text: null,
		mana_cost: null,
		colors: null,
		power: null,
		toughness: null,
		loyalty: null,
	};
}

test('groupPrintsByFaceCount: prints without face rows go to k=0, two-faced to k=2', () => {
	const groups = groupPrintsByFaceCount(['a', 'b', 'c'], [{ print_id: 'b' }, { print_id: 'b' }]);
	assert.deepEqual(
		[...groups.entries()].sort(([x], [y]) => x - y),
		[
			[0, ['a', 'c']],
			[2, ['b']],
		]
	);
});

test('groupPrintsByFaceCount: duplicate print ids are collapsed', () => {
	const groups = groupPrintsByFaceCount(
		['a', 'a', 'b', 'b'],
		[{ print_id: 'b' }, { print_id: 'b' }]
	);
	assert.deepEqual(groups.get(0), ['a']);
	assert.deepEqual(groups.get(2), ['b']);
	assert.equal(groups.size, 2);
});

test('groupPrintsByFaceCount: empty batch gives no group', () => {
	assert.equal(groupPrintsByFaceCount([], []).size, 0);
});

test('createDefinitionSelector: only the first print of an oracle emits its definition + faces', () => {
	const select = createDefinitionSelector();
	const first = select(def('o1', 'legal'), [face('o1', 0, 'Front'), face('o1', 1, 'Back')]);
	assert.ok(first);
	assert.deepEqual(first.definition.legalities, { oldschool: 'legal' });
	assert.deepEqual(
		first.definitionFaces.map((f) => f.name),
		['Front', 'Back']
	);

	// A later print of the same oracle (different per-print legality) is dropped,
	// across calls, faces included.
	assert.equal(select(def('o1', 'not_legal'), [face('o1', 0, 'Other')]), null);
	assert.equal(select(def('o1', 'legal'), []), null);

	// Another oracle is still emitted.
	const other = select(def('o2', 'not_legal'), []);
	assert.ok(other);
	assert.equal(other.definition.oracle_id, 'o2');
});

test('createDefinitionSelector: each selector has its own memory (one per run)', () => {
	const run1 = createDefinitionSelector();
	const run2 = createDefinitionSelector();
	assert.ok(run1(def('o1', 'legal'), []));
	assert.ok(run2(def('o1', 'legal'), []));
});
