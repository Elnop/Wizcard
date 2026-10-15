import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusCopyFirst } from '@/lib/card/utils/focus-copy';

const copies = [
	{ id: 'a', entry: { rowId: 'r1' } },
	{ id: 'a', entry: { rowId: 'r2' } },
	{ id: 'b', entry: { rowId: 'r3' } },
];

test('moves the focused copy first, keeping the others in order', () => {
	assert.deepEqual(
		focusCopyFirst(copies, 'r2').map((c) => c.entry.rowId),
		['r2', 'r1', 'r3']
	);
});

test('unknown or missing rowId leaves the order untouched (same array)', () => {
	assert.equal(focusCopyFirst(copies, 'nope'), copies);
	assert.equal(focusCopyFirst(copies, undefined), copies);
});
