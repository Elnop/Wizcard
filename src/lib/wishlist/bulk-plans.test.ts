// src/lib/wishlist/bulk-plans.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import { planWishlistRemove } from './bulk-plans';

const copy = (rowId: string, over: Partial<CardEntry> = {}) => ({
	rowId,
	entry: { rowId, dateAdded: 'd', wishlist: true, ...over } as CardEntry,
});

test('deck cards (deckId or loaded in a deck) only lose the flag; others are deleted', () => {
	assert.deepEqual(
		planWishlistRemove([copy('a'), copy('b', { deckId: 'D' }), copy('c')], (id) => id === 'c'),
		{ deleteIds: ['a'], unflagIds: ['b', 'c'] }
	);
});
