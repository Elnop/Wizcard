/**
 * issues.ts — Création d'issue (ajoutée au Project « Wizcard ») et lien
 * sous-issue natif. Utilisé par file-epics.ts et sync-bmad.ts.
 */
import { gh, ghGraphql, ghJson } from './gh';
import { PROJECT } from '../project-config';

export function createIssue(
	title: string,
	label: string,
	body: string
): { number: number; id: string } {
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

export function linkSubIssue(parentId: string, childId: string): void {
	ghGraphql(
		`mutation($p: ID!, $c: ID!) { addSubIssue(input: { issueId: $p, subIssueId: $c }) { clientMutationId } }`,
		{ p: parentId, c: childId }
	);
}
