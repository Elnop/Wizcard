/**
 * release-pr.ts — Maintient UNE PR de release ouverte (head `main`, base
 * `deploy`) : titre « Release YYYY-MM-DD », corps en français listant les PRs
 * livrées et les migrations à appliquer en prod avant le merge.
 *
 * Environnement : GH_TOKEN = secret WIZCARD_BOT_TOKEN (PAT du propriétaire,
 * pour que les checks de la PR se lancent).
 * Usage : `npx tsx scripts/github/release-pr.ts [--dry-run]` — en dry-run,
 * affiche le corps sans rien créer ni modifier.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gh, ghJson } from './lib/gh';
import { git } from './lib/git';
import { PROJECT } from './project-config';
import {
	extractPrNumbers,
	parsePendingMigrations,
	planReleasePr,
	releaseTokenError,
	renderReleaseBody,
	type ShippedPr,
} from './release';

const dryRun = process.argv.includes('--dry-run');

const tokenError = releaseTokenError(process.env.GH_TOKEN);
if (tokenError) {
	console.error(tokenError);
	process.exit(1);
}

git(['fetch', 'origin', 'deploy', 'main']);
const range = 'origin/deploy..origin/main';
const ahead = Number(git(['rev-list', '--count', range]).trim());
const subjects = git(['log', '--format=%s', range]).split('\n').filter(Boolean);

const open = ghJson<{ number: number }[]>([
	'pr',
	'list',
	'--repo',
	PROJECT.repo,
	'--base',
	'deploy',
	'--head',
	'main',
	'--state',
	'open',
	'--json',
	'number',
]);
const plan = planReleasePr({ openReleasePr: open[0]?.number ?? null, aheadCommits: ahead });
console.log(`${ahead} commit(s) en avance ; action : ${plan.action}`);
if (plan.action === 'none') process.exit(0);

type PrView = {
	title: string;
	labels: { name: string }[];
	closingIssuesReferences: { number: number }[];
};
const prs: ShippedPr[] = extractPrNumbers(subjects).map((number) => {
	const v = ghJson<PrView>([
		'pr',
		'view',
		String(number),
		'--repo',
		PROJECT.repo,
		'--json',
		'title,labels,closingIssuesReferences',
	]);
	return {
		number,
		title: v.title,
		closes: v.closingIssuesReferences.map((i) => i.number),
		labels: v.labels.map((l) => l.name),
	};
});
const migrations = parsePendingMigrations(
	git([
		'diff',
		'--name-only',
		'--diff-filter=A',
		'origin/deploy',
		'origin/main',
		'--',
		'supabase/migrations',
	])
);
const body = renderReleaseBody({ prs, migrations });
const title = `Release ${new Date().toISOString().slice(0, 10)}`;

if (dryRun) {
	console.log(`[dry-run] ${plan.action} « ${title} »\n`);
	console.log(body);
	console.log(`[dry-run] ${prs.length} PR(s), ${migrations.length} migration(s)`);
	process.exit(0);
}

const bodyFile = join(mkdtempSync(join(tmpdir(), 'release-')), 'body.md');
writeFileSync(bodyFile, body);
if (plan.action === 'create') {
	gh([
		'pr',
		'create',
		'--repo',
		PROJECT.repo,
		'--base',
		'deploy',
		'--head',
		'main',
		'--title',
		title,
		'--body-file',
		bodyFile,
	]);
} else {
	gh([
		'pr',
		'edit',
		String(plan.number),
		'--repo',
		PROJECT.repo,
		'--title',
		title,
		'--body-file',
		bodyFile,
	]);
}
console.log(`✔ PR de release ${plan.action === 'create' ? 'créée' : 'mise à jour'}`);
