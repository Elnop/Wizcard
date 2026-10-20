import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	ALERT_LABEL,
	alertAction,
	alertCreateArgs,
	alertListArgs,
	alertBody,
	formatStepSummary,
	missingSecrets,
	runUrl,
} from './catalog-seed';

const TIME_OK = `\tCommand being timed: "npx tsx scripts/seed/seed-sets.ts"
\tUser time (seconds): 3.10
\tElapsed (wall clock) time (h:mm:ss or m:ss): 1:02:03
\tMaximum resident set size (kbytes): 524288
\tExit status: 0
`;

const STEP = 'seed-catalog';
const RUN_URL = 'https://github.com/devinedev/Wizcard/actions/runs/42';

test('nominal run: summary line carries step, wall-clock duration and peak RSS in MB', () => {
	assert.equal(
		formatStepSummary('seed-sets', TIME_OK),
		'- **seed-sets** : succès, durée 1:02:03, pic mémoire 512.0 Mo'
	);
});

test('failed step: summary reports the exit code', () => {
	const out = `Command exited with non-zero status 1\n${TIME_OK}`;
	assert.match(formatStepSummary(STEP, out), /échec \(code 1\).*512\.0 Mo/);
});

test('killed step and skipped step are reported', () => {
	assert.match(
		formatStepSummary(STEP, `Command terminated by signal 15\n${TIME_OK}`),
		/interrompue \(signal 15\)/
	);
	assert.equal(formatStepSummary(STEP, null), `- **${STEP}** : non exécutée`);
	assert.match(formatStepSummary('x', 'garbage'), /durée inconnue, pic mémoire inconnu/);
});

test('missing secrets: names of absent or empty secrets are returned', () => {
	assert.deepEqual(missingSecrets({}), ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
	assert.deepEqual(missingSecrets({ SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: ' ' }), [
		'SUPABASE_SERVICE_ROLE_KEY',
	]);
	assert.deepEqual(
		missingSecrets({ SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
		[]
	);
});

test('seed failure / timeout: a new issue is created whose body links the run', () => {
	assert.deepEqual(alertAction([]), { kind: 'create' });
	const url = runUrl({
		GITHUB_SERVER_URL: 'https://github.com',
		GITHUB_REPOSITORY: 'devinedev/Wizcard',
		GITHUB_RUN_ID: '42',
	});
	assert.equal(url, RUN_URL);
	assert.ok(alertBody(url).includes(RUN_URL));
});

test('repeated failure: comment on the oldest open issue instead of creating one', () => {
	assert.deepEqual(alertAction([57]), { kind: 'comment', issue: 57 });
	assert.deepEqual(alertAction([61, 57, 70]), { kind: 'comment', issue: 57 });
});

test('timeout / cancel: empty or truncated time output is never reported as success', () => {
	assert.match(formatStepSummary(STEP, ''), /interrompue ou inconnue/);
	const truncated = TIME_OK.slice(0, TIME_OK.indexOf('\tExit status'));
	assert.match(formatStepSummary(STEP, truncated), /interrompue ou inconnue.*512\.0 Mo/);
});

test('alert gh args: list and create share ALERT_LABEL, list is open-only', () => {
	const list = alertListArgs('o/r');
	const create = alertCreateArgs('o/r', 'body');
	assert.equal(list[list.indexOf('--label') + 1], ALERT_LABEL);
	assert.equal(list[list.indexOf('--state') + 1], 'open');
	const labels = create.flatMap((a, i) => (create[i - 1] === '--label' ? [a] : []));
	assert.ok(labels.includes(ALERT_LABEL));
	assert.equal(create[create.indexOf('--body') + 1], 'body');
});
