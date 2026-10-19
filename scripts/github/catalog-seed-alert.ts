/**
 * catalog-seed-alert.ts — CLI du job `alert` du workflow catalog-seed : ouvre
 * une issue d'échec, ou commente celle déjà ouverte (une seule à la fois).
 * Lit GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID ; `gh` est
 * authentifié par GH_TOKEN.
 */
import { gh, ghJson } from './lib/gh';
import {
	ALERT_LABEL,
	alertAction,
	alertBody,
	alertCreateArgs,
	alertListArgs,
	runUrl,
} from './catalog-seed';

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
	console.error('catalog-seed-alert : GITHUB_REPOSITORY manquant');
	process.exit(1);
}

gh([
	'label',
	'create',
	ALERT_LABEL,
	'--repo',
	repo,
	'--force',
	'--color',
	'B60205',
	'--description',
	'Échec du workflow catalog-seed',
]);

const open = ghJson<{ number: number }[]>(alertListArgs(repo));

const body = alertBody(runUrl(process.env));
const action = alertAction(open.map((i) => i.number));

if (action.kind === 'comment') {
	gh(['issue', 'comment', String(action.issue), '--repo', repo, '--body', body]);
	console.log(`catalog-seed-alert : commentaire ajouté à #${action.issue}`);
} else {
	const url = gh(alertCreateArgs(repo, body)).trim();
	console.log(`catalog-seed-alert : issue créée ${url}`);
}
