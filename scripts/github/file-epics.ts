/**
 * file-epics.ts — Crée les epics (label `epic`) et leurs tickets enfants (sous-
 * issues natives) définis dans epics.ts, et les ajoute au Project « Wizcard ».
 * Idempotent : appariement par titre exact, un second lancement ne crée rien.
 *
 * Usage : `npm run gh:epics` (applique) ou `npm run gh:epics -- --dry-run`.
 * Ne supprime ni ne modifie jamais d'issue existante.
 */
import { gh, ghGraphql, ghJson } from './lib/gh';
import { EPICS, type EpicSpec, type StorySpec } from './epics';
import { planEpics } from './plan';
import { PROJECT } from './project-config';

const dryRun = process.argv.includes('--dry-run');
let changes = 0;

type Existing = { number: number; title: string; id: string; subIssueTitles: string[] };

function listExisting(): Existing[] {
	const [owner, name] = PROJECT.repo.split('/');
	const issues = ghJson<{ number: number; title: string; id: string }[]>([
		'issue',
		'list',
		'--repo',
		PROJECT.repo,
		'--label',
		'epic',
		'--state',
		'all',
		'--limit',
		'200',
		'--json',
		'number,title,id',
	]);
	return issues.map((i) => {
		const data = ghGraphql<{
			repository: { issue: { subIssues: { nodes: { title: string }[] } } };
		}>(
			`query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) {
  issue(number: $n) { subIssues(first: 50) { nodes { title } } } } }`,
			{ owner, name, n: i.number }
		);
		return { ...i, subIssueTitles: data.repository.issue.subIssues.nodes.map((s) => s.title) };
	});
}

function createIssue(title: string, label: string, body: string): { number: number; id: string } {
	const url = gh([
		'issue',
		'create',
		'--repo',
		PROJECT.repo,
		'--title',
		title,
		'--label',
		label,
		'--body',
		body,
		'--project',
		PROJECT.title,
	]).trim();
	const number = Number(url.split('/').pop());
	const { id } = ghJson<{ id: string }>([
		'issue',
		'view',
		String(number),
		'--repo',
		PROJECT.repo,
		'--json',
		'id',
	]);
	console.log(`  #${number} ${title}`);
	return { number, id };
}

function link(parentId: string, childId: string): void {
	ghGraphql(
		`mutation($p: ID!, $c: ID!) { addSubIssue(input: { issueId: $p, subIssueId: $c }) { clientMutationId } }`,
		{ p: parentId, c: childId }
	);
}

function act(description: string): boolean {
	changes++;
	console.log(`${dryRun ? '[dry-run] ' : ''}${description}`);
	return !dryRun;
}

const existing = listExisting();
const { createEpics, createChildren } = planEpics(existing, EPICS);
const ids = new Map(existing.map((e) => [e.title, e.id]));

for (const e of createEpics as EpicSpec[]) {
	if (act(`epic + ${e.title}`)) ids.set(e.title, createIssue(e.title, 'epic', e.body).id);
}
for (const { epicTitle, child } of createChildren as { epicTitle: string; child: StorySpec }[]) {
	if (!act(`${child.label} + ${child.title}  (↑ ${epicTitle})`)) continue;
	const parent = ids.get(epicTitle);
	if (!parent) throw new Error(`Epic introuvable : ${epicTitle}`);
	link(parent, createIssue(child.title, child.label, child.body).id);
}

console.log(changes === 0 ? '✔ already up to date' : `✔ converged (${changes} changes)`);
