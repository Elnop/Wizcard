import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import {
	EMPTY_BULK_EDIT_FORM,
	applyBulkEdit,
	buildBulkEdit,
	isEmptyBulkEdit,
	mergeTags,
} from './bulk-edit';

const ZONE = 'deck:sideboard';

const entry = (over: Partial<CardEntry> = {}): CardEntry => ({
	rowId: 'r1',
	dateAdded: '2026-01-01',
	...over,
});

test('an untouched form builds an empty edit', () => {
	const edit = buildBulkEdit(EMPTY_BULK_EDIT_FORM);
	assert.equal(isEmptyBulkEdit(edit), true);
	assert.deepEqual(edit, { set: {}, addTags: [], removeTags: [] });
});

test('tri-state and selects map to set fields; blank purchase price is ignored', () => {
	const edit = buildBulkEdit({
		...EMPTY_BULK_EDIT_FORM,
		condition: 'NM',
		language: 'French',
		proxy: 'false',
		forTrade: 'true',
		purchasePrice: '  ',
	});
	assert.deepEqual(edit.set, { condition: 'NM', language: 'French', proxy: false, forTrade: true });
});

test('purchase price is trimmed when set', () => {
	assert.equal(
		buildBulkEdit({ ...EMPTY_BULK_EDIT_FORM, purchasePrice: ' 1.50 ' }).set.purchasePrice,
		'1.50'
	);
});

test('foil yes carries the chosen type; foil no clears the type', () => {
	assert.deepEqual(
		buildBulkEdit({ ...EMPTY_BULK_EDIT_FORM, foil: 'true', foilType: 'etched' }).set,
		{
			isFoil: true,
			foilType: 'etched',
		}
	);
	assert.deepEqual(buildBulkEdit({ ...EMPTY_BULK_EDIT_FORM, foil: 'false' }).set, {
		isFoil: false,
		foilType: undefined,
	});
});

test('mergeTags: remove then add, order kept, add wins, zone tag protected', () => {
	assert.deepEqual(mergeTags(['a', ZONE, 'b'], ['c', 'b', 'a'], ['a', 'b', ZONE]), [
		ZONE,
		'c',
		'b',
		'a',
	]);
	assert.deepEqual(mergeTags(undefined, ['x'], []), ['x']);
	assert.deepEqual(mergeTags(['x', 'x'], ['x'], []), ['x']);
});

test('mergeTags: a zone tag can never be added', () => {
	assert.deepEqual(mergeTags(['a'], [ZONE, 'b'], []), ['a', 'b']);
	assert.deepEqual(mergeTags(['a', ZONE], [ZONE, 'deck:mainboard', 'b'], []), ['a', ZONE, 'b']);
});

test('applyBulkEdit sets fields, merges tags, clears foilType on non-foil', () => {
	const before = entry({ isFoil: true, foilType: 'etched', tags: ['old'], condition: 'LP' });
	const after = applyBulkEdit(before, {
		set: { isFoil: false, foilType: undefined },
		addTags: ['new'],
		removeTags: ['old'],
	});
	assert.equal(after.isFoil, false);
	assert.equal(after.foilType, undefined);
	assert.equal(after.condition, 'LP');
	assert.deepEqual(after.tags, ['new']);
	assert.equal(before.isFoil, true, 'input not mutated');
});

test('applyBulkEdit leaves tags untouched when no tag change is asked', () => {
	const before = entry({ tags: ['keep'] });
	assert.equal(
		applyBulkEdit(before, { set: { proxy: true }, addTags: [], removeTags: [] }).tags,
		before.tags
	);
});
