/**
 * pr-policy-check.ts — Vérifie la politique de PR (nom de branche + mot-clé de
 * fermeture d'issue) à partir de l'environnement : PR_HEAD_REF, PR_BASE_REF,
 * PR_BODY, PR_IS_FORK ('true' | 'false').
 *
 * Affiche les raisons, les ajoute à $GITHUB_STEP_SUMMARY si défini, et sort
 * avec le code 1 si la PR ne respecte pas la politique.
 */
import { appendFileSync } from 'node:fs';
import { checkPrPolicy } from './policy';

const result = checkPrPolicy({
	headRef: process.env.PR_HEAD_REF ?? '',
	baseRef: process.env.PR_BASE_REF ?? '',
	body: process.env.PR_BODY ?? null,
	isFork: process.env.PR_IS_FORK === 'true',
});

if (result.ok) {
	console.log('pr-policy : OK');
} else {
	for (const reason of result.reasons) console.error(`pr-policy : ${reason}`);
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) {
		const lines = result.reasons.map((r) => '- ' + r).join('\n');
		appendFileSync(summary, `### pr-policy\n\n${lines}\n`);
	}
	process.exit(1);
}
