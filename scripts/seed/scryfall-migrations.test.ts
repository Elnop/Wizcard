import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	MIN_EXPECTED_MIGRATIONS,
	assertComplete,
	collectMigrations,
	type ScryfallListPage,
	dedupeById,
	nextPageUrl,
	toMigrationRow,
	type ScryfallMigrationRow,
} from './scryfall-migrations';

const P1 = 'https://api.scryfall.com/migrations';
const P2 = 'https://api.scryfall.com/migrations?page=2';
const P3 = 'https://api.scryfall.com/migrations?page=3';

const MERGE = {
	object: 'migration',
	id: 'dde3e951-d14a-4fda-b1bc-fbfded69ce6f',
	uri: 'https://api.scryfall.com/migrations/dde3e951-d14a-4fda-b1bc-fbfded69ce6f',
	performed_at: '2026-09-23',
	migration_strategy: 'merge',
	old_scryfall_id: '52abea40-2736-49a8-a372-16b7b93d510a',
	new_scryfall_id: 'fd2ad967-dd77-4c3a-b53c-2929ecf7750f',
	note: 'Rebalanced cards have been removed from Arena',
	metadata: {
		id: '52abea40-2736-49a8-a372-16b7b93d510a',
		lang: 'en',
		name: 'A-Oran-Rief Ooze',
		set_code: 'znr',
		oracle_id: '2f795893-886a-401d-af9a-76d3e6bff519',
		collector_number: 'A-198',
	},
};

// Scryfall omits new_scryfall_id entirely on a delete.
const DELETE = {
	object: 'migration',
	id: '645d119f-58b3-4cdd-8014-7fc34e9a45b8',
	uri: 'https://api.scryfall.com/migrations/645d119f-58b3-4cdd-8014-7fc34e9a45b8',
	performed_at: '2026-09-18',
	migration_strategy: 'delete',
	old_scryfall_id: '7fc47cd0-97df-4363-8269-c3074273e7ec',
	note: 'Mapped to wrong Beast',
};

test('valid merge maps every field', () => {
	assert.deepEqual(toMigrationRow(MERGE), {
		id: MERGE.id,
		strategy: 'merge',
		old_scryfall_id: MERGE.old_scryfall_id,
		new_scryfall_id: MERGE.new_scryfall_id,
		note: MERGE.note,
		performed_at: '2026-09-23',
		metadata: MERGE.metadata,
	});
});

test('valid delete without new id or metadata maps to nulls', () => {
	const row = toMigrationRow(DELETE);
	assert.equal(row.strategy, 'delete');
	assert.equal(row.new_scryfall_id, null);
	assert.equal(row.metadata, null);
	assert.equal(row.note, 'Mapped to wrong Beast');
	assert.equal('recorded_at' in row, false);
});

test('invalid object: unknown strategy, error cites the id', () => {
	assert.throws(
		() => toMigrationRow({ ...MERGE, migration_strategy: 'split' }),
		new RegExp(`${MERGE.id}.*migration_strategy`)
	);
});

test('invalid object: non-UUID id', () => {
	assert.throws(() => toMigrationRow({ ...MERGE, id: 'not-a-uuid' }), /not-a-uuid.*id non-UUID/);
});

test('invalid object: merge without new_scryfall_id', () => {
	const noTarget: Record<string, unknown> = { ...MERGE };
	delete noTarget.new_scryfall_id;
	assert.throws(() => toMigrationRow(noTarget), new RegExp(`${MERGE.id}.*merge sans`));
	assert.throws(() => toMigrationRow({ ...MERGE, new_scryfall_id: null }), /merge sans/);
});

test('invalid object: bad old id, date, object type', () => {
	assert.throws(() => toMigrationRow({ ...MERGE, old_scryfall_id: 42 }), /old_scryfall_id/);
	assert.throws(() => toMigrationRow({ ...MERGE, performed_at: 'yesterday' }), /performed_at/);
	assert.throws(() => toMigrationRow({ ...MERGE, object: 'card' }), /object/);
	assert.throws(() => toMigrationRow(null), /pas un objet/);
});

test('pagination: next page, last page, inconsistent', () => {
	assert.equal(nextPageUrl({ has_more: true, next_page: P2 }), P2);
	assert.equal(nextPageUrl({ has_more: false }), null);
	assert.throws(() => nextPageUrl({ has_more: true }), /has_more sans next_page/);
	assert.throws(() => nextPageUrl({ has_more: true, next_page: '' }), /has_more sans next_page/);
	assert.throws(() => nextPageUrl({}), /pagination incohérente/);
});

function rows(n: number): ScryfallMigrationRow[] {
	const base = toMigrationRow(DELETE);
	return Array.from({ length: n }, (_, i) => ({
		...base,
		id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
	}));
}

test('truncated listing: below the floor throws, at the floor passes', () => {
	assert.throws(() => assertComplete(rows(MIN_EXPECTED_MIGRATIONS - 1)), /upsert annulé/);
	assert.throws(() => assertComplete([]), /upsert annulé/);
	assert.doesNotThrow(() => assertComplete(rows(MIN_EXPECTED_MIGRATIONS)));
});

test('dedupeById keeps the first occurrence', () => {
	const [a, b] = rows(2);
	const out = dedupeById([a, b, { ...a, note: 'dup' }]);
	assert.deepEqual(out, [a, b]);
});

test('uppercase UUIDs are lowercased', () => {
	const row = toMigrationRow({
		...MERGE,
		id: MERGE.id.toUpperCase(),
		old_scryfall_id: MERGE.old_scryfall_id.toUpperCase(),
		new_scryfall_id: MERGE.new_scryfall_id.toUpperCase(),
	});
	assert.equal(row.id, MERGE.id);
	assert.equal(row.old_scryfall_id, MERGE.old_scryfall_id);
	assert.equal(row.new_scryfall_id, MERGE.new_scryfall_id);
});

test('invalid object: metadata array, non-string note, bad new id on a merge', () => {
	assert.throws(() => toMigrationRow({ ...MERGE, metadata: [] }), /metadata non objet/);
	assert.throws(() => toMigrationRow({ ...MERGE, note: 42 }), /note non textuelle/);
	assert.throws(
		() => toMigrationRow({ ...MERGE, new_scryfall_id: 'nope' }),
		new RegExp(`${MERGE.id}.*new_scryfall_id non-UUID`)
	);
});

test('invalid object: non-string id is cited in the error', () => {
	assert.throws(
		() => toMigrationRow({ ...MERGE, id: 123 }),
		/migration 123 invalide : id non-UUID/
	);
});

test('invalid object: impossible calendar date', () => {
	assert.throws(() => toMigrationRow({ ...MERGE, performed_at: '2026-02-30' }), /performed_at/);
	assert.throws(() => toMigrationRow({ ...MERGE, performed_at: '2026-13-01' }), /performed_at/);
	assert.equal(toMigrationRow({ ...MERGE, performed_at: '2024-02-29' }).performed_at, '2024-02-29');
});

test('pagination: has_more as a string is rejected', () => {
	assert.throws(() => nextPageUrl({ has_more: 'true', next_page: 'x' }), /pagination incohérente/);
});

// --- collectMigrations: fetch + validate everything before any write ---------

function validObjects(n: number, offset = 0) {
	return Array.from({ length: n }, (_, i) => ({
		...DELETE,
		id: `00000000-0000-4000-8000-${(i + offset).toString(16).padStart(12, '0')}`,
	}));
}

/** Fake fetcher over a url → page map; records every url it is asked for. */
function fakeFetcher(pages: Record<string, ScryfallListPage | Error>) {
	const calls: string[] = [];
	const fetchPage = async (url: string): Promise<ScryfallListPage> => {
		calls.push(url);
		const page = pages[url];
		if (page === undefined) throw new Error(`unexpected url ${url}`);
		if (page instanceof Error) throw page;
		return page;
	};
	return { fetchPage, calls };
}

const half = MIN_EXPECTED_MIGRATIONS / 2;

test('collect: all pages valid → rows, pages counted', async () => {
	const { fetchPage, calls } = fakeFetcher({
		[P1]: { has_more: true, next_page: P2, data: validObjects(half) },
		[P2]: { has_more: false, data: validObjects(half, half) },
	});
	const out = await collectMigrations(fetchPage, P1, 0);
	assert.equal(out.rows.length, MIN_EXPECTED_MIGRATIONS);
	assert.equal(out.pages, 2);
	assert.equal(out.duplicates, 0);
	assert.deepEqual(calls, [P1, P2]);
});

test('collect: a failing 2nd page throws and no further page is requested', async () => {
	const { fetchPage, calls } = fakeFetcher({
		[P1]: { has_more: true, next_page: P2, data: validObjects(half) },
		[P2]: new Error('GET page 2 failed: HTTP 500'),
		[P3]: { has_more: false, data: validObjects(half, half) },
	});
	await assert.rejects(collectMigrations(fetchPage, P1, 0), /HTTP 500/);
	assert.deepEqual(calls, [P1, P2]);
});

test('collect: an invalid object on page 2 stops paging', async () => {
	const { fetchPage, calls } = fakeFetcher({
		[P1]: { has_more: true, next_page: P2, data: validObjects(half) },
		[P2]: {
			has_more: true,
			next_page: P3,
			data: [{ ...MERGE, migration_strategy: 'split' }],
		},
		[P3]: { has_more: false, data: validObjects(half, half) },
	});
	await assert.rejects(collectMigrations(fetchPage, P1, 0), new RegExp(MERGE.id));
	assert.deepEqual(calls, [P1, P2]);
});

test('collect: missing data throws', async () => {
	const { fetchPage } = fakeFetcher({ [P1]: { has_more: false } });
	await assert.rejects(collectMigrations(fetchPage, P1, 0), /data absent/);
});

test('collect: a repeated next_page throws instead of looping', async () => {
	const { fetchPage, calls } = fakeFetcher({
		[P1]: { has_more: true, next_page: P2, data: validObjects(10) },
		[P2]: { has_more: true, next_page: P1, data: validObjects(10, 10) },
	});
	await assert.rejects(collectMigrations(fetchPage, P1, 0), /page déjà lue/);
	assert.deepEqual(calls, [P1, P2]);
});

test('collect: a next_page outside Scryfall throws and is never fetched', async () => {
	const evil = 'https://evil.example/migrations?page=2';
	const { fetchPage, calls } = fakeFetcher({
		[P1]: { has_more: true, next_page: evil, data: validObjects(10) },
	});
	await assert.rejects(collectMigrations(fetchPage, P1, 0), /hors Scryfall/);
	assert.deepEqual(calls, [P1]);
});

test('collect: duplicates are removed before the floor check', async () => {
	// MIN objects in total, but one repeated across pages → MIN - 1 distinct → below floor.
	const { fetchPage } = fakeFetcher({
		[P1]: { has_more: true, next_page: P2, data: validObjects(half) },
		[P2]: { has_more: false, data: validObjects(half, half - 1) },
	});
	await assert.rejects(collectMigrations(fetchPage, P1, 0), /upsert annulé/);

	const ok = fakeFetcher({
		[P1]: { has_more: true, next_page: P2, data: validObjects(half + 1) },
		[P2]: { has_more: false, data: validObjects(half, half) },
	});
	const out = await collectMigrations(ok.fetchPage, P1, 0);
	assert.equal(out.rows.length, MIN_EXPECTED_MIGRATIONS);
	assert.equal(out.duplicates, 1);
});
