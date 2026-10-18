/**
 * project.ts — Accès partagé au GitHub Project « Wizcard » : recherche du
 * projet, champ Status et ses options. Utilisé par setup-project.ts et
 * mark-deployed.ts.
 */
import { ghGraphql, ghJson } from './gh';
import { PROJECT } from '../project-config';

export type ProjectRef = { id: string; number: number; title: string; url: string };
export type StatusOption = { id: string; name: string; color?: string; description?: string };
export type StatusField = { id: string; options: StatusOption[] };

export function listProjects(): ProjectRef[] {
	return ghJson<{ projects: ProjectRef[] }>([
		'project',
		'list',
		'--owner',
		PROJECT.owner,
		'--limit',
		'100',
		'--format',
		'json',
	]).projects;
}

export function findProject(): ProjectRef | undefined {
	return listProjects().find((p) => p.title === PROJECT.title);
}

/** Fragment GraphQL du champ Status (à insérer dans `... on ProjectV2 { }`). */
export const STATUS_FIELD_FRAGMENT = `status: field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name color description } } }`;

export function getStatusField(projectId: string): StatusField | null {
	const data = ghGraphql<{ node: { status: StatusField | null } }>(
		`query($project: ID!) { node(id: $project) { ... on ProjectV2 { ${STATUS_FIELD_FRAGMENT} } } }`,
		{ project: projectId }
	);
	return data.node.status;
}
