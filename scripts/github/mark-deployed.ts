/**
 * mark-deployed.ts — Après le merge d'une PR de release dans `deploy`, passe
 * à « Deployed » chaque item du Project au statut « Done (main) » dont le
 * commit de merge est ancêtre de `origin/deploy`.
 *
 * Item PR : son `mergeCommit`. Item issue : le commit de merge de la PR qui
 * la ferme (`closedByPullRequestsReferences`).
 *
 * Environnement : GH_TOKEN = secret WIZCARD_BOT_TOKEN (scopes repo + project).
 * Usage : `npx tsx scripts/github/mark-deployed.ts [--dry-run]` — en dry-run,
 * liste les items à déplacer sans rien modifier.
 */
import { ghGraphql } from './lib/gh';
import { git, gitRaw } from './lib/git';
import { findProject, getStatusField } from './lib/project';
import { releaseTokenError } from './release';

const dryRun = process.argv.includes('--dry-run');
const FROM = 'Done (main)';
const TO = 'Deployed';

const tokenError = releaseTokenError(process.env.GH_TOKEN);
if (tokenError) {
	console.error(tokenError);
	process.exit(1);
}

type Merge = { oid: string } | null;
type Item = {
	id: string;
	status: { name: string } | null;
	content: {
		__typename?: string;
		number?: number;
		mergeCommit?: Merge;
		closedByPullRequestsReferences?: { nodes: { number: number; mergeCommit: Merge }[] };
	} | null;
};
type Page = {
	node: {
		items: { nodes: Item[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
	};
};

const ITEMS_QUERY = `query($project: ID!, $after: String) { node(id: $project) { ... on ProjectV2 {
  items(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
      content {
        __typename
        ... on PullRequest { number mergeCommit { oid } }
        ... on Issue { number closedByPullRequestsReferences(first: 10) { nodes { number mergeCommit { oid } } } }
      }
    }
  }
} } }`;

function listItems(projectId: string): Item[] {
	const items: Item[] = [];
	let after: string | null = null;
	for (;;) {
		const page: Page = ghGraphql<Page>(ITEMS_QUERY, { project: projectId, after });
		items.push(...page.node.items.nodes);
		if (!page.node.items.pageInfo.hasNextPage) return items;
		after = page.node.items.pageInfo.endCursor;
	}
}

function mergeOids(item: Item): string[] {
	const c = item.content;
	if (!c) return [];
	const oids = [
		c.mergeCommit?.oid,
		...(c.closedByPullRequestsReferences?.nodes ?? []).map((p) => p.mergeCommit?.oid),
	];
	return oids.filter((o): o is string => Boolean(o));
}

function isOnDeploy(oid: string): boolean {
	return gitRaw(['merge-base', '--is-ancestor', oid, 'origin/deploy']).status === 0;
}

git(['fetch', 'origin', 'deploy', 'main']);
const project = findProject();
if (!project) throw new Error('Projet « Wizcard » introuvable');
const status = getStatusField(project.id);
const deployed = status?.options.find((o) => o.name === TO);
if (!status || !deployed) throw new Error(`Option de statut « ${TO} » introuvable`);

const candidates = listItems(project.id).filter((i) => i.status?.name === FROM);
const toMove = candidates.filter((i) => {
	const oids = mergeOids(i);
	return oids.length > 0 && oids.every(isOnDeploy);
});
console.log(`${candidates.length} item(s) « ${FROM} », ${toMove.length} à passer « ${TO} »`);

for (const item of toMove) {
	const label = `${item.content?.__typename ?? 'Item'} #${item.content?.number ?? '?'}`;
	console.log(`${dryRun ? '[dry-run] ' : ''}${label} → ${TO}`);
	if (dryRun) continue;
	ghGraphql(
		`mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { clientMutationId } }`,
		{ project: project.id, item: item.id, field: status.id, option: deployed.id }
	);
}
