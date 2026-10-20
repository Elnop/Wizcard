/**
 * catalog-seed-step.ts — CLI du job `seed` du workflow catalog-seed.
 * Exécuté depuis le second checkout `.tooling` (sans node_modules) : n'importe
 * que `./catalog-seed` et `node:*`.
 *
 *   --check-secrets            sort en 1 si SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquent
 *   --summary <step> <file>    ajoute la durée et le pic mémoire (sortie de
 *                              `/usr/bin/time -v -o <file>`) à $GITHUB_STEP_SUMMARY
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { formatStepSummary, missingSecrets } from './catalog-seed';

function appendSummary(markdown: string): void {
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) appendFileSync(summary, markdown + '\n');
}

const [mode, ...rest] = process.argv.slice(2);

if (mode === '--check-secrets') {
	const missing = missingSecrets(process.env);
	if (missing.length > 0) {
		const msg = `Secrets manquants dans l'Environment GitHub « prod » : ${missing.join(', ')}. Voir docs/guides/catalog-seed.md.`;
		console.error(`catalog-seed : ${msg}`);
		appendSummary(`### catalog-seed\n\n${msg}\n`);
		process.exit(1);
	}
	console.log('catalog-seed : secrets présents');
} else if (mode === '--summary' && rest.length === 2) {
	const [step, file] = rest;
	const output = existsSync(file) ? readFileSync(file, 'utf8') : null;
	const line = formatStepSummary(step, output);
	console.log(line);
	appendSummary(line);
} else {
	console.error('usage : catalog-seed-step.ts --check-secrets | --summary <step> <timeFile>');
	process.exit(2);
}
