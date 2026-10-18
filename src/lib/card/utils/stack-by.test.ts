import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredStackBy, stackByFromArray, stackByToArray } from '@/lib/card/utils/stack-by';

test('empty / non-array / garbage → by name', () => {
	assert.deepEqual(stackByFromArray([]), []);
	assert.deepEqual(stackByFromArray(null), []);
	assert.deepEqual(stackByFromArray('garbage'), []);
	assert.deepEqual(stackByFromArray(['foo', 42]), []);
});

test('known criteria kept, unknown dropped, duplicates removed, canonical order', () => {
	assert.deepEqual(stackByFromArray(['language', 'foo', 'print', 'print']), ['print', 'language']);
});

test("['copy'] → 'copy'; copy mixed with criteria → by name (invalid)", () => {
	assert.equal(stackByFromArray(['copy']), 'copy');
	assert.deepEqual(stackByFromArray(['copy', 'print']), []);
});

test('round trip', () => {
	assert.deepEqual(stackByToArray('copy'), ['copy']);
	assert.deepEqual(stackByToArray(['finish', 'print']), ['print', 'finish']);
	assert.deepEqual(stackByFromArray(stackByToArray(['flags', 'condition'])), [
		'condition',
		'flags',
	]);
});

test('parseStoredStackBy: missing, corrupt JSON or foreign shape → by name', () => {
	assert.deepEqual(parseStoredStackBy(null), []);
	assert.deepEqual(parseStoredStackBy('not json{'), []);
	assert.deepEqual(parseStoredStackBy('"garbage"'), []);
	assert.deepEqual(parseStoredStackBy('["foo"]'), []);
	assert.equal(parseStoredStackBy('["copy"]'), 'copy');
	assert.deepEqual(parseStoredStackBy('["finish","print"]'), ['print', 'finish']);
});
