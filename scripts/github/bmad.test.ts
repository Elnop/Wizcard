import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markerOf, parseEpics, planBmadSync, renderEpicBody, renderStoryBody } from './bmad';

const EN = `---
status: draft
---

# Wizcard - Epic Breakdown

## Epic List

1. Collection

## Epic 1: Collection

Players manage the cards they own.

<!-- Repeat for each story -->

### Story 1.1: Add a card

As a signed-in player,
I want to add a card to my collection,
So that I can track what I own.

**Acceptance Criteria:**

**Given** a card
**When** I add it
**Then** it is in my collection

### Story 1.2: Remove a card

As a player,
I want to remove a card,
So that my collection stays accurate.

Touches card_entries only.

**Acceptance Criteria:**

**Given** a card in my collection
**When** I remove it
**Then** it is gone
`;

const FR = `## Epic 2 : Decks

Construire des decks.

### Story 2.1 : Créer un deck

**En tant que** joueur,
**Je veux** créer un deck,
**Afin d'**organiser mes cartes.

**Critères d'acceptation :**

- Étant donné rien, quand je crée, alors le deck existe
`;

test('parseEpics reads the BMAD English template', () => {
	const [epic, ...rest] = parseEpics(EN);
	assert.equal(rest.length, 0);
	assert.equal(epic.key, '1');
	assert.equal(epic.title, 'Collection');
	assert.equal(epic.goal, 'Players manage the cards they own.');
	assert.deepEqual(
		epic.stories.map((s) => [s.key, s.title]),
		[
			['1.1', 'Add a card'],
			['1.2', 'Remove a card'],
		]
	);
	const [s1, s2] = epic.stories;
	assert.equal(s1.role, 'signed-in player');
	assert.equal(s1.want, 'add a card to my collection');
	assert.equal(s1.benefit, 'I can track what I own');
	assert.equal(s1.criteria, '**Given** a card\n**When** I add it\n**Then** it is in my collection');
	assert.equal(s1.notes, '');
	assert.equal(s2.notes, 'Touches card_entries only.');
});

test('parseEpics reads French headings, bold prefixes and elided "afin d\'"', () => {
	const [epic] = parseEpics(FR);
	assert.equal(epic.title, 'Decks');
	const [s] = epic.stories;
	assert.equal(s.key, '2.1');
	assert.equal(s.role, 'joueur');
	assert.equal(s.want, 'créer un deck');
	assert.equal(s.benefit, 'organiser mes cartes');
	assert.match(s.criteria, /^- Étant donné/);
});

test('parseEpics rejects duplicate keys, misplaced stories and stories without want/criteria', () => {
	assert.throws(() => parseEpics(`${FR}\n${FR}`), /dupliquée/);
	assert.throws(() => parseEpics(FR.replace('Story 2.1', 'Story 3.1')), /hors de son epic/);
	assert.throws(() => parseEpics(FR.replace('**Je veux** créer un deck,', '')), /Je veux/);
	assert.throws(() => parseEpics(FR.replace(/\*\*Critères[\s\S]*$/, '')), /critères/);
});

test('rendered bodies follow the issue forms and carry their marker', () => {
	const [epic] = parseEpics(EN);
	const eb = renderEpicBody(epic);
	assert.match(
		eb,
		/^### Objectif\n\nPlayers manage the cards they own\.\n\n### Valeur \/ pourquoi\n\n_No response_/
	);
	assert.equal(markerOf(eb), 'epic:1');
	const sb = renderStoryBody(epic.stories[0]);
	for (const h of [
		'En tant que',
		'Je veux',
		'Afin de',
		"Critères d'acceptation",
		'Notes techniques',
	]) {
		assert.ok(sb.includes(`### ${h}\n\n`), h);
	}
	assert.match(sb, /### Notes techniques\n\nÀ préciser à la prise en charge\./);
	assert.equal(markerOf(sb), 'story:1.1');
});

test('markerOf finds the marker anywhere in an edited body, null without one', () => {
	assert.equal(markerOf('edited on GitHub\n\n<!--bmad:story:12.3-->\nmore'), 'story:12.3');
	assert.equal(markerOf('no marker'), null);
});

test('planBmadSync creates only what has no marker yet', () => {
	const epics = parseEpics(`${EN}\n${FR}`);
	const r = planBmadSync(new Set(['epic:1', 'story:1.1']), epics);
	assert.deepEqual(
		r.createEpics.map((e) => e.key),
		['2']
	);
	assert.deepEqual(
		r.createStories.map((c) => [c.epic.key, c.story.key]),
		[
			['1', '1.2'],
			['2', '2.1'],
		]
	);
	const all = new Set(['epic:1', 'epic:2', 'story:1.1', 'story:1.2', 'story:2.1']);
	const none = planBmadSync(all, epics);
	assert.equal(none.createEpics.length + none.createStories.length, 0);
});
