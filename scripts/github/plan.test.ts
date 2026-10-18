import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFields, planLabels, planStatusOptions, planViews } from './plan';

const DONE = 'Done (main)';

test('planLabels creates missing, updates drifted, ignores unknown', () => {
	const r = planLabels(
		[
			{ name: 'bug', color: 'ff0000', description: 'old' },
			{ name: 'wontfix', color: '000000', description: '' },
		],
		[
			{ name: 'bug', color: 'd73a4a', description: 'Bug' },
			{ name: 'epic', color: '5319e7', description: 'Epic' },
		]
	);
	assert.deepEqual(
		r.create.map((l) => l.name),
		['epic']
	);
	assert.deepEqual(
		r.update.map((l) => l.name),
		['bug']
	);
});

test('planLabels is a no-op when equal (case-insensitive name, # and case on colour)', () => {
	const r = planLabels(
		[{ name: 'Bug', color: 'D73A4A', description: 'Bug' }],
		[{ name: 'bug', color: '#d73a4a', description: 'Bug' }]
	);
	assert.deepEqual(r, { create: [], update: [] });
});

test('planStatusOptions keeps existing ids and configured order', () => {
	const r = planStatusOptions(
		[
			{ id: 'a', name: DONE },
			{ id: 'b', name: 'Todo' },
		],
		['Backlog', DONE]
	);
	assert.deepEqual(r, [{ name: 'Backlog' }, { id: 'a', name: DONE }]);
});

test('planStatusOptions returns null when already converged', () => {
	const r = planStatusOptions(
		[
			{ id: 'a', name: 'Backlog' },
			{ id: 'b', name: 'Done' },
		],
		['Backlog', 'Done']
	);
	assert.equal(r, null);
});

test('planStatusOptions reorders when names match but order differs', () => {
	const r = planStatusOptions(
		[
			{ id: 'a', name: 'Done' },
			{ id: 'b', name: 'Backlog' },
		],
		['Backlog', 'Done']
	);
	assert.deepEqual(r, [
		{ id: 'b', name: 'Backlog' },
		{ id: 'a', name: 'Done' },
	]);
});

test('planFields / planViews return only missing by name', () => {
	const views = planViews(
		['Kanban'],
		[
			{ name: 'Kanban', layout: 'BOARD_LAYOUT' },
			{ name: 'Par epic', layout: 'TABLE_LAYOUT' },
			{ name: 'À déployer', layout: 'TABLE_LAYOUT' },
			{ name: 'Roadmap', layout: 'ROADMAP_LAYOUT' },
		]
	);
	assert.deepEqual(
		views.map((v) => v.name),
		['Par epic', 'À déployer', 'Roadmap']
	);
	const fields = planFields(
		['Début'],
		[
			{ name: 'Début', kind: 'DATE' },
			{ name: 'Itération', kind: 'ITERATION' },
		]
	);
	assert.deepEqual(
		fields.map((f) => f.name),
		['Itération']
	);
});
