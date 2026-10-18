/**
 * setup-rulesets.ts — Converge les réglages de merge du dépôt et les rulesets
 * `main` / `deploy` (idempotent). Avec `--remove-classic`, supprime la
 * protection de branche classique de `main` une fois les deux rulesets lus
 * comme actifs.
 * Usage : `npm run gh:rules [-- --dry-run] [-- --remove-classic]` — en dry-run,
 * seules des lectures (GET) sont faites ; chaque mutation est seulement affichée.
 */
import { gh, ghJson } from './lib/gh';
import { PROJECT } from './project-config';
import { REPO_SETTINGS, RULESETS } from './rulesets-config';
import { canRemoveClassicProtection, planRulesets } from './rulesets';

const dryRun = process.argv.includes('--dry-run');
const removeClassic = process.argv.includes('--remove-classic');
const repo = PROJECT.repo;

type Listed = { id: number; name: string; enforcement: string };
const listRulesets = () => ghJson<Listed[]>(['api', `repos/${repo}/rulesets`]);

function mutate(method: string, path: string, body?: object): void {
	if (dryRun) {
		console.log(`[dry-run] ${method} ${path}`);
		if (body) console.log(JSON.stringify(body, null, 2));
		return;
	}
	gh(['api', '-X', method, path, ...(body ? ['--input', '-'] : [])], body && JSON.stringify(body));
}

console.log('Réglages de merge du dépôt');
mutate('PATCH', `repos/${repo}`, REPO_SETTINGS);

const plan = planRulesets(
	listRulesets(),
	RULESETS.map((r) => r.name)
);
const payloadOf = (name: string) => RULESETS.find((r) => r.name === name)!.payload;
for (const name of plan.create) {
	console.log(`Création du ruleset ${name}`);
	mutate('POST', `repos/${repo}/rulesets`, payloadOf(name));
}
for (const { id, name } of plan.update) {
	console.log(`Mise à jour du ruleset ${name} (#${id})`);
	mutate('PUT', `repos/${repo}/rulesets/${id}`, payloadOf(name));
}

if (!removeClassic) process.exit(0);

const classicPath = `repos/${repo}/branches/main/protection`;
if (dryRun) {
	console.log(
		`[dry-run] DELETE ${classicPath} (seulement si main et deploy sont actifs en lecture)`
	);
	process.exit(0);
}
if (!canRemoveClassicProtection(listRulesets())) {
	console.error('Rulesets main/deploy non actifs : protection classique conservée.');
	process.exit(1);
}
try {
	gh(['api', '-X', 'DELETE', classicPath]);
	console.log('Protection classique de main supprimée.');
} catch (e) {
	if (!/404|not found/i.test(String(e))) throw e;
	console.log('Protection classique déjà supprimée.');
}
