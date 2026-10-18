// src/lib/collection/bulk-plans.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import { planAssignToDeck, planCollectionRemove, summarizeAssign } from './bulk-plans';

const copy = (rowId: string, over: Partial<CardEntry> = {}) => ({
	rowId,
	entry: { rowId, dateAdded: 'd', ...over } as CardEntry,
});

test('remove: free copies are deleted, deck-linked copies detached', () => {
	assert.deepEqual(planCollectionRemove([copy('a'), copy('b', { deckId: 'D' }), copy('c')]), {
		deleteIds: ['a', 'c'],
		detachIds: ['b'],
	});
});

test('assign: free / moved from another deck / already in target', () => {
	const plan = planAssignToDeck(
		[
			copy('a', { tags: ['x'] }),
			copy('b', { deckId: 'A', tags: ['deck:mainboard'] }),
			copy('c', { deckId: 'T', tags: ['deck:mainboard'] }),
		],
		'T',
		'sideboard'
	);
	assert.deepEqual(
		plan.map((p) => [p.rowId, p.kind, p.fromDeckId]),
		[
			['a', 'free', undefined],
			['b', 'moved', 'A'],
			['c', 'same', undefined],
		]
	);
	assert.deepEqual(plan[0].entry.tags, ['x', 'deck:sideboard']);
	assert.equal(plan[1].entry.deckId, 'T');
	assert.deepEqual(plan[2].entry.tags, ['deck:sideboard']);
});

test('summary counts same and moved per source deck', () => {
	const plan = planAssignToDeck(
		[copy('a', { deckId: 'A' }), copy('b', { deckId: 'A' }), copy('c', { deckId: 'T' }), copy('d')],
		'T',
		'mainboard'
	);
	const s = summarizeAssign(plan);
	assert.equal(s.total, 4);
	assert.equal(s.same, 1);
	assert.deepEqual([...s.movedByDeck], [['A', 2]]);
});
