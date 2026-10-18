import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	planEpics,
	planFields,
	planLabels,
	planStatusOptions,
	planViewFilters,
	planViews,
} from './plan';

const DONE = 'Done (main)';
const NOT_EPIC = '-label:epic';

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

test('planEpics skips existing epic and existing children', () => {
	const story = (title: string) => ({ title, label: 'story' as const, body: '' });
	const A = { title: '[Epic] A', body: '', children: [story('[US] x'), story('[US] y')] };
	const B = { title: '[Epic] B', body: '', children: [story('[US] z')] };
	const r = planEpics([{ number: 1, title: '[Epic] A', subIssueTitles: ['[US] x'] }], [A, B]);
	assert.deepEqual(r.createEpics, [B]);
	assert.deepEqual(r.createChildren, [
		{ epicTitle: '[Epic] A', child: A.children[1] },
		{ epicTitle: '[Epic] B', child: B.children[0] },
	]);
});

test('planViewFilters detects drift, clears stale filters, ignores unknown views', () => {
	const r = planViewFilters(
		[
			{ id: 'v1', name: 'Kanban', filter: null },
			{ id: 'v2', name: 'Par epic', filter: 'label:epic' },
			{ id: 'v3', name: 'Manual', filter: 'x' },
		],
		[
			{ name: 'Kanban', layout: 'BOARD_LAYOUT', filter: NOT_EPIC },
			{ name: 'Par epic', layout: 'TABLE_LAYOUT' },
			{ name: 'Roadmap', layout: 'ROADMAP_LAYOUT', filter: 'label:epic' },
		]
	);
	assert.deepEqual(r, [
		{ id: 'v1', name: 'Kanban', filter: NOT_EPIC },
		{ id: 'v2', name: 'Par epic', filter: '' },
	]);
});

test('planViewFilters is a no-op when filters match (null/undefined/empty equal)', () => {
	const r = planViewFilters(
		[
			{ id: 'v1', name: 'Kanban', filter: NOT_EPIC },
			{ id: 'v2', name: 'Par epic', filter: null },
			{ id: 'v3', name: 'Roadmap', filter: '' },
		],
		[
			{ name: 'Kanban', layout: 'BOARD_LAYOUT', filter: NOT_EPIC },
			{ name: 'Par epic', layout: 'TABLE_LAYOUT' },
			{ name: 'Roadmap', layout: 'ROADMAP_LAYOUT', filter: '' },
		]
	);
	assert.deepEqual(r, []);
});
