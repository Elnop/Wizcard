import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPO_SETTINGS, RULESETS } from './rulesets-config';
import { canRemoveClassicProtection, planRulesets } from './rulesets';

const ACTIVE = 'active';
const EXISTING_MAIN = { id: 7, name: 'main' };

type Rule = { type: string; parameters?: Record<string, unknown> };

function rulesOf(name: string): Rule[] {
	const r = RULESETS.find((x) => x.name === name);
	assert.ok(r, `ruleset ${name} missing`);
	return (r.payload as { rules: Rule[] }).rules;
}

function ruleOf(name: string, type: string): Rule {
	const rule = rulesOf(name).find((x) => x.type === type);
	assert.ok(rule, `${name}: rule ${type} missing`);
	return rule;
}

test('planRulesets creates what is missing and updates by name', () => {
	const p = planRulesets([EXISTING_MAIN], ['main', 'deploy']);
	assert.deepEqual(p.create, ['deploy']);
	assert.deepEqual(p.update, [EXISTING_MAIN]);
});

test('planRulesets creates everything when nothing exists', () => {
	const p = planRulesets([], ['main', 'deploy']);
	assert.deepEqual(p.create, ['main', 'deploy']);
	assert.deepEqual(p.update, []);
});

test('canRemoveClassicProtection is false when deploy is missing', () => {
	assert.equal(canRemoveClassicProtection([{ name: 'main', enforcement: ACTIVE }]), false);
});

test('canRemoveClassicProtection is false when main is only evaluating', () => {
	assert.equal(
		canRemoveClassicProtection([
			{ name: 'main', enforcement: 'evaluate' },
			{ name: 'deploy', enforcement: ACTIVE },
		]),
		false
	);
});

test('canRemoveClassicProtection is true when both are active', () => {
	assert.equal(
		canRemoveClassicProtection([
			{ name: 'main', enforcement: ACTIVE },
			{ name: 'deploy', enforcement: ACTIVE },
		]),
		true
	);
});

test('both required-status-checks rules are non-strict', () => {
	for (const name of ['main', 'deploy']) {
		const p = ruleOf(name, 'required_status_checks').parameters;
		assert.equal(p?.strict_required_status_checks_policy, false, name);
	}
});

test('required check contexts match the workflow job names', () => {
	const ctx = (n: string) =>
		(
			ruleOf(n, 'required_status_checks').parameters?.required_status_checks as {
				context: string;
			}[]
		).map((c) => c.context);
	assert.deepEqual(ctx('main'), ['check-build', 'pr-policy']);
	assert.deepEqual(ctx('deploy'), ['deploy-guard']);
});

test('merge methods, approvals, bypass and enforcement', () => {
	const main = RULESETS.find((r) => r.name === 'main')!.payload as Record<string, unknown>;
	const dep = RULESETS.find((r) => r.name === 'deploy')!.payload as Record<string, unknown>;
	assert.deepEqual(ruleOf('main', 'pull_request').parameters?.allowed_merge_methods, ['squash']);
	assert.deepEqual(ruleOf('deploy', 'pull_request').parameters?.allowed_merge_methods, ['merge']);
	assert.equal(ruleOf('main', 'pull_request').parameters?.required_approving_review_count, 0);
	assert.equal(main.enforcement, ACTIVE);
	assert.equal(dep.enforcement, ACTIVE);
	assert.equal((main.bypass_actors as unknown[]).length, 1);
	assert.deepEqual(dep.bypass_actors, []);
	for (const n of ['main', 'deploy']) {
		assert.ok(rulesOf(n).some((r) => r.type === 'non_fast_forward'));
		assert.ok(rulesOf(n).some((r) => r.type === 'deletion'));
	}
});

test('repo settings forbid rebase merges', () => {
	assert.equal(REPO_SETTINGS.allow_rebase_merge, false);
	assert.equal(REPO_SETTINGS.delete_branch_on_merge, true);
});
