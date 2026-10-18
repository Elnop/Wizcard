import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	directCommitSubjects,
	extractPrNumbers,
	pickReleasePr,
	parsePendingMigrations,
	planReleasePr,
	releaseTokenError,
	renderReleaseBody,
	type ShippedPr,
} from './release';

const MIG_A = 'supabase/migrations/20260102_a.sql';
const MIG_B = 'supabase/migrations/20260101_b.sql';
const NEEDS_MIGRATION = 'needs-migration';

test('parsePendingMigrations keeps sorted migration sql files only', () => {
	const diff = [MIG_A, 'src/app/page.tsx', 'supabase/migrations/README.md', MIG_B, ''].join('\n');
	assert.deepEqual(parsePendingMigrations(diff), [MIG_B, MIG_A]);
	assert.deepEqual(parsePendingMigrations(''), []);
});

test('extractPrNumbers dedupes, sorts and ignores subjects without (#N)', () => {
	const subjects = [
		'feat: b (#12)',
		'fix: a (#3)',
		'feat: b again (#12)',
		'no number here',
		'x (#7) y',
	];
	assert.deepEqual(extractPrNumbers(subjects), [3, 12]);
});

test('renderReleaseBody lists PRs, closes and migrations', () => {
	const prs: ShippedPr[] = [
		{ number: 5, title: 'Add thing', closes: [1, 2], labels: [NEEDS_MIGRATION] },
		{ number: 6, title: 'Plain', closes: [], labels: [] },
	];
	const body = renderReleaseBody({ prs, migrations: [MIG_A] });
	assert.match(body, /## Contenu/);
	const line5 = body.split('\n').find((l) => l.startsWith('- #5')) ?? '';
	assert.match(line5, /Add thing/);
	assert.match(line5, /ferme #1, #2/);
	assert.match(line5, /⚠️/);
	const line6 = body.split('\n').find((l) => l.startsWith('- #6')) ?? '';
	assert.doesNotMatch(line6, /⚠️|ferme/);
	assert.match(body, /## Migrations à appliquer AVANT le merge/);
	assert.ok(body.includes(MIG_A));
	assert.match(body, /## Procédure/);
	assert.match(body, /idempotent \+ transactionnel/);
	assert.match(body, /schema_migrations/);
	assert.match(body, /npm run sb:verify:prod/);
	assert.match(body, /Jo : merger cette PR avec « Create a merge commit »/);
});

test('renderReleaseBody with zero migrations says so', () => {
	assert.match(renderReleaseBody({ prs: [], migrations: [] }), /Aucune migration\./);
});

test('planReleasePr decides create / update / none', () => {
	assert.deepEqual(planReleasePr({ openReleasePr: null, aheadCommits: 3 }), { action: 'create' });
	assert.deepEqual(planReleasePr({ openReleasePr: 57, aheadCommits: 3 }), {
		action: 'update',
		number: 57,
	});
	assert.deepEqual(planReleasePr({ openReleasePr: 57, aheadCommits: 0 }), { action: 'none' });
	assert.deepEqual(planReleasePr({ openReleasePr: null, aheadCommits: 0 }), { action: 'none' });
});

test('releaseTokenError flags a missing WIZCARD_BOT_TOKEN', () => {
	for (const t of ['', undefined, '  ']) {
		const msg = releaseTokenError(t);
		assert.ok(msg?.includes('WIZCARD_BOT_TOKEN'));
		assert.ok(msg?.includes('gh secret set WIZCARD_BOT_TOKEN'));
	}
	assert.equal(releaseTokenError('x'), null);
});

test('renderReleaseBody lists direct commits under Contenu', () => {
	const body = renderReleaseBody({ prs: [], migrations: [], otherCommits: ['fix: hotfix'] });
	assert.match(body, /- fix: hotfix \(commit direct\)/);
	assert.doesNotMatch(body, /Aucune PR\./);
});

test('directCommitSubjects keeps subjects without (#N)', () => {
	assert.deepEqual(directCommitSubjects(['a (#1)', 'b', 'c (#2)']), ['b']);
});

test('directCommitSubjects treats unresolvable (#N) refs as direct commits', () => {
	const subjects = ['a (#1)', 'revert (#2)', 'b'];
	assert.deepEqual(directCommitSubjects(subjects, new Set([1])), ['revert (#2)', 'b']);
});

test('pickReleasePr ignores cross-repository PRs', () => {
	assert.equal(pickReleasePr([{ number: 9, isCrossRepository: true }]), null);
	assert.equal(
		pickReleasePr([
			{ number: 9, isCrossRepository: true },
			{ number: 4, isCrossRepository: false },
		]),
		4
	);
	assert.equal(pickReleasePr([]), null);
});
