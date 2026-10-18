import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowIdsOfSelected } from './selection';

type Copy = { entry: { rowId: string; ownerId?: string } };
type Stack = { copies: Copy[] };
const c = (rowId: string, owned = false): Copy => ({
	entry: { rowId, ownerId: owned ? 'u' : undefined },
});

const NONFOIL = 'sol|nonfoil';

const stacks = new Map<string, Stack>([
	['sol|foil', { copies: [c('f1')] }],
	[NONFOIL, { copies: [c('n1', true), c('n2')] }],
]);
const copiesOf = (s: Stack) => s.copies;

test('a selected stack resolves to its own copies only', () => {
	assert.deepEqual(rowIdsOfSelected(new Set([NONFOIL]), stacks, copiesOf), ['n1', 'n2']);
});

test('stale keys are ignored; predicate filters copies', () => {
	assert.deepEqual(
		rowIdsOfSelected(new Set([NONFOIL, 'gone']), stacks, copiesOf, (x) => !x.entry.ownerId),
		['n2']
	);
});
