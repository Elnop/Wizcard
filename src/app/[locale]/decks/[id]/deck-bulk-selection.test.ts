import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedDeckCard } from './useDeckDetail';
import type { DeckStack } from './useDeckCardSections';
import { rowIdsOfSelectedStacks } from './useDeckBulkSelection';

const card = (rowId: string, owned = false) =>
	({ entry: { rowId, ownerId: owned ? 'u' : undefined } }) as unknown as ResolvedDeckCard;

const MAIN_NONFOIL = 'mainboard:sol|nonfoil';
const stack = (selectionKey: string, copies: ResolvedDeckCard[]): [string, DeckStack] => [
	selectionKey,
	{ selectionKey, zone: selectionKey.startsWith('side') ? 'sideboard' : 'mainboard', copies },
];
const stacks = new Map<string, DeckStack>([
	stack('mainboard:sol|foil', [card('f1')]),
	stack(MAIN_NONFOIL, [card('n1', true), card('n2')]),
	stack('sideboard:sol|nonfoil', [card('s1')]),
]);

test('a selected stack resolves to its own copies only (not other zones / finishes)', () => {
	assert.deepEqual(rowIdsOfSelectedStacks(new Set([MAIN_NONFOIL]), stacks), ['n1', 'n2']);
});

test('predicate filters copies; unknown (stale) keys are ignored', () => {
	assert.deepEqual(
		rowIdsOfSelectedStacks(new Set([MAIN_NONFOIL, 'stale:key']), stacks, (c) => !c.entry.ownerId),
		['n2']
	);
});
