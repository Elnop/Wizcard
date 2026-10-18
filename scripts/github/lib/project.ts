/**
 * project.ts — Accès partagé au GitHub Project « Wizcard » : recherche du
 * projet, champ Status et ses options. Utilisé par setup-project.ts et
 * mark-deployed.ts.
 */
import { ghGraphql } from './gh';
import { PROJECT } from '../project-config';

export type ProjectRef = { id: string; number: number; title: string; url: string };
export type StatusOption = { id: string; name: string; color?: string; description?: string };
export type StatusField = { id: string; options: StatusOption[] };

// GraphQL on `viewer` rather than `gh project list --owner`: the CLI command
// can require read:org, which the bot PAT (repo + project) does not have. The
// project is owned by the token's own account, so `viewer` is that owner.
export function listProjects(): ProjectRef[] {
	return ghGraphql<{ viewer: { projectsV2: { nodes: ProjectRef[] } } }>(
		'query { viewer { projectsV2(first: 100) { nodes { id number title url } } } }'
	).viewer.projectsV2.nodes;
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
