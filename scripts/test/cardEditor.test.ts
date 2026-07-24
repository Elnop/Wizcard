import assert from 'node:assert/strict';
import test from 'node:test';
import {
	calculateManaValue,
	createInitialCardDraft,
	deriveCardColors,
	normalizeSetCode,
	parseCardTags,
	validateCardDraft,
} from '../../src/lib/card-editor/draft';
import { CARD_LAYOUT_LIST, getCardLayout } from '../../src/lib/card-editor/layout-registry';

test('calculates mana value from generic, colored and hybrid symbols', () => {
	assert.equal(calculateManaValue('{2}{U}{R/G}{X}'), 4);
});

test('derives a stable WUBRG color order from card content', () => {
	const draft = createInitialCardDraft();
	const face = draft.faces[0];
	face.manaCost = '{2}{R}{G}';
	face.oracleText = 'Create a {U} token.';
	assert.deepEqual(deriveCardColors(face), ['U', 'R', 'G']);
});

test('normalizes set codes and deduplicates tags', () => {
	assert.equal(normalizeSetCode(' w!z-42 '), 'WZ42');
	assert.deepEqual(parseCardTags('cube, custom, cube,  '), ['cube', 'custom']);
});

test('requires the three pieces needed for a publishable card', () => {
	const draft = createInitialCardDraft();
	assert.deepEqual(validateCardDraft(draft), ['name', 'type', 'artwork']);
	draft.faces[0].name = 'Sunlit Wayfinder';
	draft.faces[0].typeLine = 'Creature — Scout';
	draft.faces[0].artwork.dataUrl = 'data:image/png;base64,AA==';
	assert.deepEqual(validateCardDraft(draft), []);
});

test('defaults to the standard portrait card ratio and hides legacy landscape drafts', () => {
	const draft = createInitialCardDraft();
	const layout = getCardLayout(draft.layoutId);
	assert.equal(draft.mseTemplateId, 'magic-m15');
	assert.equal(layout.orientation, 'portrait');
	assert.equal(layout.geometry.width / layout.geometry.height, 744 / 1039);
	assert.equal(
		CARD_LAYOUT_LIST.some((candidate) => candidate.id === 'landscape'),
		false
	);
});
