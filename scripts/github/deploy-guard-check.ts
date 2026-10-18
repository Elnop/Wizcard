/**
 * deploy-guard-check.ts — Garde de la branche `deploy` : seule la branche
 * `main` de ce dépôt (pas un fork) peut y être fusionnée. Lit PR_HEAD_REF,
 * PR_BASE_REF, PR_BODY, PR_IS_FORK ('true' | 'false') dans l'environnement.
 *
 * Affiche les raisons, les ajoute à $GITHUB_STEP_SUMMARY si défini, et sort
 * avec le code 1 si la PR est refusée.
 */
import { appendFileSync } from 'node:fs';
import { checkDeployGuard } from './policy';

const result = checkDeployGuard({
	headRef: process.env.PR_HEAD_REF ?? '',
	baseRef: process.env.PR_BASE_REF ?? '',
	body: process.env.PR_BODY ?? null,
	isFork: process.env.PR_IS_FORK === 'true',
});

if (result.ok) {
	console.log('deploy-guard : OK');
} else {
	for (const reason of result.reasons) console.error(`deploy-guard : ${reason}`);
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) {
		const lines = result.reasons.map((r) => '- ' + r).join('\n');
		appendFileSync(summary, `### deploy-guard\n\n${lines}\n`);
	}
	process.exit(1);
}
