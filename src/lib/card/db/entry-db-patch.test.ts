import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import { entryDbPatch, isEmptyDbPatch } from './entry-db-patch';

const base: CardEntry = { rowId: 'r', dateAdded: 'd', condition: 'LP', tags: ['a'] };

test('identical entries give an empty patch', () => {
	assert.equal(isEmptyDbPatch(entryDbPatch(base, { ...base, tags: ['a'] })), true);
});

test('only changed columns are emitted, undefined becomes null', () => {
	assert.deepEqual(
		entryDbPatch(
			{ ...base, isFoil: true, foilType: 'etched' },
			{ ...base, condition: 'NM', isFoil: false, foilType: undefined }
		),
		{ condition: 'NM', is_foil: false, foil_type: null }
	);
});

test('tags compare by value; deck and wishlist columns are mapped', () => {
	assert.deepEqual(
		entryDbPatch(base, { ...base, tags: ['a', 'deck:mainboard'], deckId: 'D', wishlist: false }),
		{ tags: ['a', 'deck:mainboard'], deck_id: 'D' }
	);
	assert.deepEqual(entryDbPatch({ ...base, wishlist: true }, { ...base, wishlist: false }), {
		wishlist: false,
	});
});

test('for_trade / alter / proxy / purchase_price / language', () => {
	assert.deepEqual(
		entryDbPatch(base, {
			...base,
			forTrade: true,
			alter: true,
			proxy: false,
			purchasePrice: '2',
			language: 'French',
		}),
		{ for_trade: true, alter: true, proxy: false, purchase_price: '2', language: 'French' }
	);
});
