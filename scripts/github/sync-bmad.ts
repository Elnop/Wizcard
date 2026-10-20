/**
 * sync-bmad.ts — Pousse les epics/stories BMAD (`epics.md`) en issues : une
 * issue `epic` par epic, une issue `story` par story (sous-issue native de son
 * epic), ajoutées au Project « Wizcard ». Sens unique, création seule :
 * appariement par marqueur caché (`<!-- bmad:story:1.2 -->`), une issue
 * existante n'est jamais modifiée — GitHub fait foi une fois l'issue créée.
 *
 * Usage : `npm run gh:bmad` (applique), `npm run gh:bmad -- --dry-run`,
 * `npm run gh:bmad -- <chemin/epics.md>` (défaut ci-dessous).
 */
import { existsSync, readFileSync } from 'node:fs';
import { ghJson } from './lib/gh';
import { createIssue, linkSubIssue } from './lib/issues';
import {
	epicKey,
	epicTitle,
	markerOf,
	parseEpics,
	planBmadSync,
	renderEpicBody,
	renderStoryBody,
	storyTitle,
} from './bmad';
import { PROJECT } from './project-config';

const DEFAULT_PATH = '_bmad-output/planning-artifacts/epics.md';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const path = args.find((a) => !a.startsWith('--')) ?? DEFAULT_PATH;
let changes = 0;

/**
 * Clé BMAD → node id, sur toutes les issues (tous états, sans filtre de label :
 * un label retiré sur GitHub ne doit pas provoquer de doublon).
 */
function listExisting(): Map<string, string> {
	const issues = ghJson<{ id: string; body: string }[]>([
		'issue',
		'list',
		'--repo',
		PROJECT.repo,
		'--state',
		'all',
		'--limit',
		'5000',
		'--json',
		'id,body',
	]);
	const ids = new Map<string, string>();
	for (const i of issues) {
		const key = markerOf(i.body);
		if (key && !ids.has(key)) ids.set(key, i.id);
	}
	return ids;
}

function act(description: string): boolean {
	changes++;
	console.log(`${dryRun ? '[dry-run] ' : ''}${description}`);
	return !dryRun;
}

if (!existsSync(path)) {
	console.error(`✘ ${path} introuvable (lancer bmad-create-epics-and-stories d'abord)`);
	process.exit(1);
}
const epics = parseEpics(readFileSync(path, 'utf8'));
const ids = listExisting();
const { createEpics, createStories } = planBmadSync(new Set(ids.keys()), epics);

for (const e of createEpics) {
	if (act(`epic + ${e.key} ${epicTitle(e)}`)) {
		ids.set(epicKey(e.key), createIssue(epicTitle(e), 'epic', renderEpicBody(e)).id);
	}
}
for (const { epic, story } of createStories) {
	if (!act(`story + ${story.key} ${storyTitle(story)}  (↑ ${epicTitle(epic)})`)) continue;
	const parent = ids.get(epicKey(epic.key));
	if (!parent) throw new Error(`Issue de l'epic ${epic.key} introuvable`);
	linkSubIssue(parent, createIssue(storyTitle(story), 'story', renderStoryBody(story)).id);
}

console.log(changes === 0 ? '✔ already up to date' : `✔ converged (${changes} changes)`);
