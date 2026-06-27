import assert from 'node:assert';
import {
	collectDeckTokenIds,
	collectDeckTokensWithSourceLang,
} from '../../src/lib/deck/utils/collectDeckTokens';

const lolthFr = {
	id: 'lolth-fr',
	lang: 'fr',
	all_parts: [
		{
			object: 'related_card',
			id: 'lolth-fr',
			component: 'combo_piece',
			name: 'Lolth, Spider Queen',
			type_line: 'Legendary Planeswalker — Lolth',
			uri: '',
		},
		{
			object: 'related_card',
			id: 'spider-en',
			component: 'token',
			name: 'Spider',
			type_line: 'Token Creature — Spider',
			uri: '',
		},
		{
			object: 'related_card',
			id: 'emblem-en',
			component: 'combo_piece',
			name: 'Lolth, Spider Queen Emblem',
			type_line: 'Emblem — Lolth',
			uri: '',
		},
	],
} as const;

// collectDeckTokenIds: unchanged behavior — token + emblem, not the card's own face
const ids = collectDeckTokenIds([lolthFr] as never);
assert.deepStrictEqual(
	new Set(ids),
	new Set(['spider-en', 'emblem-en']),
	'ids should be spider + emblem'
);

// New: source language preserved
const map = collectDeckTokensWithSourceLang([lolthFr] as never);
assert.strictEqual(map.get('spider-en'), 'fr', 'spider source lang fr');
assert.strictEqual(map.get('emblem-en'), 'fr', 'emblem source lang fr');

// Card without all_parts → empty, no crash
assert.deepStrictEqual(collectDeckTokenIds([{ id: 'x' }]), [], 'no all_parts → []');
assert.strictEqual(
	collectDeckTokensWithSourceLang([{ id: 'x' }]).size,
	0,
	'no all_parts → empty map'
);

// Missing lang defaults to 'en'
const noLang = {
	id: 'y',
	all_parts: [
		{
			object: 'related_card',
			id: 'tok',
			component: 'token',
			name: 'T',
			type_line: 'Token Creature',
			uri: '',
		},
	],
};
assert.strictEqual(
	collectDeckTokensWithSourceLang([noLang as never]).get('tok'),
	'en',
	'missing lang → en'
);

console.log('collectDeckTokens: all assertions passed');
