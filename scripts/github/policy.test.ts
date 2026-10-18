import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDeployGuard, checkPrPolicy, type PrContext } from './policy';

const CLOSES_17 = 'Closes #17';

function pr(over: Partial<PrContext>): PrContext {
	return { headRef: 'chore/17-x', baseRef: 'main', body: CLOSES_17, isFork: false, ...over };
}

test('checkPrPolicy accepts a well-formed branch and closing keyword', () => {
	const r = checkPrPolicy(pr({ headRef: 'chore/17-check-green' }));
	assert.equal(r.ok, true);
	assert.deepEqual(r.reasons, []);
});

test('checkPrPolicy rejects a bad branch pattern', () => {
	const r = checkPrPolicy(pr({ headRef: 'feature/foo', body: 'Closes #1' }));
	assert.equal(r.ok, false);
	assert.equal(r.reasons.length, 1);
	assert.match(r.reasons[0], /branche/);
});

test('checkPrPolicy rejects a null body', () => {
	const r = checkPrPolicy(pr({ headRef: 'fix/3-x', body: null }));
	assert.equal(r.ok, false);
	assert.equal(r.reasons.length, 1);
});

test('checkPrPolicy accepts the closing keyword variants', () => {
	for (const body of ['Fixes #3', 'closes #12', 'Resolved #4']) {
		assert.equal(checkPrPolicy(pr({ body })).ok, true, body);
	}
	assert.equal(checkPrPolicy(pr({ body: 'Refs #4' })).ok, false);
});

test('checkPrPolicy rejects malformed closing keywords', () => {
	for (const body of ['prefix #3', 'Closes#3', '']) {
		assert.equal(checkPrPolicy(pr({ body })).ok, false, JSON.stringify(body));
	}
	assert.equal(checkPrPolicy(pr({ body: 'Fixes: #3' })).ok, true);
});

test('checkPrPolicy exempts forks from the branch rule only', () => {
	assert.equal(checkPrPolicy(pr({ headRef: 'patch-1', body: 'Closes #9', isFork: true })).ok, true);
	assert.equal(checkPrPolicy(pr({ headRef: 'patch-1', body: 'nothing', isFork: true })).ok, false);
});

test('checkPrPolicy skips PRs into deploy', () => {
	const r = checkPrPolicy(pr({ baseRef: 'deploy', headRef: 'main', body: null }));
	assert.equal(r.ok, true);
	assert.deepEqual(r.reasons, []);
});

test('checkDeployGuard requires head main from this repo', () => {
	const into = { baseRef: 'deploy' };
	assert.equal(checkDeployGuard(pr({ ...into, headRef: 'main' })).ok, true);
	assert.equal(checkDeployGuard(pr({ ...into, headRef: 'chore/1-x' })).ok, false);
	assert.equal(checkDeployGuard(pr({ ...into, headRef: 'main', isFork: true })).ok, false);
});

test('checkDeployGuard ignores PRs not into deploy', () => {
	assert.equal(checkDeployGuard(pr({ baseRef: 'main', headRef: 'chore/1-x' })).ok, true);
});
