/**
 * catalog-seed.ts — Règles pures du workflow `catalog-seed` (seed du catalogue
 * Scryfall de prod). Aucune I/O et AUCUN import : ce fichier est exécuté depuis
 * un second checkout de l'outillage (`.tooling`) qui n'a pas de `node_modules`.
 * Les CLIs (catalog-seed-step.ts, catalog-seed-alert.ts) lisent l'environnement
 * et appellent ces fonctions.
 */

/** Secrets de l'Environment GitHub `prod` attendus par le job de seed. */
export const REQUIRED_SECRETS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

/** Label qui identifie les issues d'échec du seed (dédoublonnage). */
export const ALERT_LABEL = 'catalog-seed';

export const ALERT_TITLE = 'Échec du seed du catalogue prod (workflow catalog-seed)';

/** Noms des secrets requis absents ou vides dans `env`. */
export function missingSecrets(env: Record<string, string | undefined>): string[] {
	return REQUIRED_SECRETS.filter((name) => !env[name]?.trim());
}

const ELAPSED = /Elapsed \(wall clock\) time (?:\([^)]*\))?:\s*(\S+)/;
const MAX_RSS = /Maximum resident set size \(kbytes\):\s*(\d+)/;
const EXIT_ZERO = /Exit status:\s*0\b/;
const EXIT_STATUS = /Command (?:exited with non-zero status (\d+)|terminated by signal (\d+))/;

/**
 * Ligne markdown du résumé de job pour une étape, à partir de la sortie de
 * `/usr/bin/time -v`. `null` = l'étape n'a pas été exécutée (fichier absent).
 */
export function formatStepSummary(step: string, timeVerboseOutput: string | null): string {
	if (timeVerboseOutput === null) return `- **${step}** : non exécutée`;
	const elapsed = ELAPSED.exec(timeVerboseOutput)?.[1] ?? 'inconnue';
	const rssKb = MAX_RSS.exec(timeVerboseOutput)?.[1];
	const rss = rssKb === undefined ? 'inconnu' : `${(Number(rssKb) / 1024).toFixed(1)} Mo`;
	const exit = EXIT_STATUS.exec(timeVerboseOutput);
	// Pas de ligne « Exit status: 0 » = fichier vide ou tronqué (timeout, annulation).
	let status = EXIT_ZERO.test(timeVerboseOutput) ? 'succès' : 'interrompue ou inconnue';
	if (exit?.[1]) status = `échec (code ${exit[1]})`;
	else if (exit?.[2]) status = `interrompue (signal ${exit[2]})`;
	return `- **${step}** : ${status}, durée ${elapsed}, pic mémoire ${rss}`;
}

export type AlertAction = { kind: 'create' } | { kind: 'comment'; issue: number };

/** Crée une issue si aucune n'est ouverte, sinon commente la plus ancienne. */
export function alertAction(openIssueNumbers: number[]): AlertAction {
	if (openIssueNumbers.length === 0) return { kind: 'create' };
	return { kind: 'comment', issue: Math.min(...openIssueNumbers) };
}

/** Arguments `gh` qui listent les issues d'échec ouvertes. */
export function alertListArgs(repo: string): string[] {
	return [
		'issue',
		'list',
		'--repo',
		repo,
		'--label',
		ALERT_LABEL,
		'--state',
		'open',
		'--limit',
		'100',
		'--json',
		'number',
	];
}

/** Arguments `gh` qui créent l'issue d'échec (même label que le filtre de liste). */
export function alertCreateArgs(repo: string, body: string): string[] {
	return [
		'issue',
		'create',
		'--repo',
		repo,
		'--title',
		ALERT_TITLE,
		'--label',
		'bug',
		'--label',
		ALERT_LABEL,
		'--body',
		body,
	];
}

/** Corps de l'issue (ou du commentaire) d'échec. */
export function alertBody(runUrl: string): string {
	return [
		'Le workflow `catalog-seed` ne s’est pas terminé en succès (échec, timeout ou annulation).',
		'',
		`Run : ${runUrl}`,
		'',
		'Voir `docs/guides/catalog-seed.md` § « Handling a failure issue ». Fermer cette issue une fois le seed relancé avec succès.',
	].join('\n');
}

/** URL du run courant à partir des variables d'environnement GitHub Actions. */
export function runUrl(env: Record<string, string | undefined>): string {
	const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
	return `${server}/${env.GITHUB_REPOSITORY ?? ''}/actions/runs/${env.GITHUB_RUN_ID ?? ''}`;
}
