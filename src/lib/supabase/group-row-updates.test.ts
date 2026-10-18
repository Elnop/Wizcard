import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRowUpdates } from './group-row-updates';

test('rows with the same patch share one group, key order ignored', () => {
	const groups = groupRowUpdates([
		{ rowId: 'a', updates: { condition: 'NM', proxy: true } },
		{ rowId: 'b', updates: { proxy: true, condition: 'NM' } },
		{ rowId: 'c', updates: { condition: 'LP' } },
	]);
	assert.equal(groups.length, 2);
	assert.deepEqual(groups[0], { updates: { condition: 'NM', proxy: true }, rowIds: ['a', 'b'] });
	assert.deepEqual(groups[1], { updates: { condition: 'LP' }, rowIds: ['c'] });
});

test('tag arrays are part of the identity (order matters)', () => {
	const groups = groupRowUpdates([
		{ rowId: 'a', updates: { tags: ['x', 'y'] } },
		{ rowId: 'b', updates: { tags: ['y', 'x'] } },
	]);
	assert.equal(groups.length, 2);
});

test('groups are chunked', () => {
	const rows = Array.from({ length: 450 }, (_, i) => ({
		rowId: `r${i}`,
		updates: { proxy: true },
	}));
	const groups = groupRowUpdates(rows, 200);
	assert.deepEqual(
		groups.map((g) => g.rowIds.length),
		[200, 200, 50]
	);
});

test('empty patches are dropped', () => {
	assert.deepEqual(groupRowUpdates([{ rowId: 'a', updates: {} }]), []);
});
