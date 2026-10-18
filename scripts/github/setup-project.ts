/**
 * setup-project.ts — Fait CONVERGER les labels du dépôt et le GitHub Project
 * (v2, propriété de l'utilisateur) « Wizcard » vers la config déclarée dans
 * project-config.ts. Idempotent : un second lancement ne change rien.
 *
 * Usage : `npm run gh:setup` (applique) ou `npm run gh:setup -- --dry-run`
 * (affiche ce qui serait fait, sans rien modifier).
 *
 * Les filtres de vues sont convergés via GraphQL ; regroupements, workflows
 * intégrés et champs de la Roadmap restent manuels (voir docs/workflow/github-project.md).
 * Ne supprime jamais rien (labels, projets, champs, vues).
 */
import { gh, ghGraphql, ghJson } from './lib/gh';
import {
	FIELDS,
	ITERATION_DURATION_DAYS,
	LABELS,
	PROJECT,
	STATUS_OPTIONS,
	VIEWS,
	type LabelSpec,
} from './project-config';
import { planFields, planLabels, planStatusOptions, planViewFilters, planViews } from './plan';

const dryRun = process.argv.includes('--dry-run');
let changes = 0;

function act(description: string, run: () => void): void {
	changes++;
	console.log(`${dryRun ? '[dry-run] ' : ''}${description}`);
	if (!dryRun) run();
}

// ── Labels ───────────────────────────────────────────────────────────────
function syncLabels(): void {
	const existing = ghJson<LabelSpec[]>([
		'label',
		'list',
		'--repo',
		PROJECT.repo,
		'--limit',
		'200',
		'--json',
		'name,color,description',
	]);
	const { create, update } = planLabels(existing, LABELS);
	for (const l of create) {
		act(`label + ${l.name}`, () =>
			gh([
				'label',
				'create',
				l.name,
				'--repo',
				PROJECT.repo,
				'--color',
				l.color,
				'--description',
				l.description,
			])
		);
	}
	for (const l of update) {
		act(`label ~ ${l.name}`, () =>
			gh([
				'label',
				'edit',
				l.name,
				'--repo',
				PROJECT.repo,
				'--color',
				l.color,
				'--description',
				l.description,
			])
		);
	}
}

// ── Projet ───────────────────────────────────────────────────────────────
type ProjectRef = { id: string; number: number; title: string; url: string };

function listProjects(): ProjectRef[] {
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

function ensureProject(): ProjectRef | null {
	let project = listProjects().find((p) => p.title === PROJECT.title);
	if (!project) {
		act(`project + ${PROJECT.title}`, () => {
			gh(['project', 'create', '--owner', PROJECT.owner, '--title', PROJECT.title]);
		});
		if (dryRun) return null;
		project = listProjects().find((p) => p.title === PROJECT.title);
		if (!project) throw new Error('Projet créé mais introuvable');
	}
	// `link` est idempotent côté GitHub ; on tolère « déjà lié ».
	if (!dryRun) {
		try {
			gh([
				'project',
				'link',
				String(project.number),
				'--owner',
				PROJECT.owner,
				'--repo',
				PROJECT.repo,
			]);
		} catch (e) {
			if (!/already/i.test(String(e))) throw e;
		}
	}
	return project;
}

// ── Champs / statut / vues ───────────────────────────────────────────────
type ProjectState = {
	node: {
		status: {
			id: string;
			options: { id: string; name: string; color?: string; description?: string }[];
		} | null;
		fields: { nodes: { id?: string; name?: string }[] };
		views: { nodes: { name: string }[] };
	};
};

const STATE_QUERY = `query($project: ID!) { node(id: $project) { ... on ProjectV2 {
  status: field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name color description } } }
  fields(first: 50) { nodes { ... on ProjectV2FieldCommon { id name } } }
  views(first: 50) { nodes { name } }
} } }`;

const OPTION_COLORS = ['GRAY', 'BLUE', 'YELLOW', 'ORANGE', 'PURPLE', 'GREEN'];

function syncProject(project: ProjectRef | null): void {
	if (!project) {
		// dry-run sur un projet inexistant : tout est à créer.
		for (const f of FIELDS) console.log(`[dry-run] field + ${f.name} (${f.kind})`);
		console.log(`[dry-run] status → ${STATUS_OPTIONS.join(' → ')}`);
		for (const v of VIEWS) console.log(`[dry-run] view + ${v.name} (${v.layout})`);
		changes += FIELDS.length + 1 + VIEWS.length;
		return;
	}
	const state = ghGraphql<ProjectState>(STATE_QUERY, { project: project.id }).node;

	// Statut
	if (state.status) {
		const statusId = state.status.id;
		const plan = planStatusOptions(state.status.options, STATUS_OPTIONS);
		if (plan) {
			act(`status → ${STATUS_OPTIONS.join(' → ')}`, () => {
				// Options existantes : couleur/description inchangées ; nouvelles : palette.
				const options = plan.map((o, i) => ({
					...o,
					color: o.color ?? OPTION_COLORS[i % OPTION_COLORS.length],
					description: o.description ?? '',
				}));
				ghGraphql(
					`mutation($id: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: { fieldId: $id, singleSelectOptions: $options }) { clientMutationId } }`,
					{ id: statusId, options }
				);
			});
		}
	}

	// Champs
	for (const f of planFields(
		state.fields.nodes.flatMap((n) => (n.name ? [n.name] : [])),
		FIELDS
	)) {
		act(`field + ${f.name} (${f.kind})`, () => {
			if (f.kind === 'ITERATION') {
				// `gh project field-create` ne gère pas ITERATION : GraphQL direct.
				ghGraphql(
					`mutation($project: ID!, $name: String!, $start: Date!, $days: Int!) {
  createProjectV2Field(input: { projectId: $project, name: $name, dataType: ITERATION, iterationConfiguration: { startDate: $start, duration: $days, iterations: [] } }) { clientMutationId } }`,
					{
						project: project.id,
						name: f.name,
						start: new Date().toISOString().slice(0, 10),
						days: ITERATION_DURATION_DAYS,
					}
				);
				return;
			}
			gh([
				'project',
				'field-create',
				String(project.number),
				'--owner',
				PROJECT.owner,
				'--name',
				f.name,
				'--data-type',
				f.kind,
			]);
		});
	}

	// Vues
	for (const v of planViews(
		state.views.nodes.map((n) => n.name),
		VIEWS
	)) {
		act(`view + ${v.name} (${v.layout})`, () => {
			ghGraphql(
				`mutation($project: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
  createProjectV2View(input: { projectId: $project, name: $name, layout: $layout }) { clientMutationId } }`,
				{ project: project.id, name: v.name, layout: v.layout }
			);
		});
	}

	// Filtres de vues (relecture : inclut les vues tout juste créées)
	const views = ghGraphql<{
		node: { views: { nodes: { id: string; name: string; filter: string | null }[] } };
	}>(
		`query($project: ID!) { node(id: $project) { ... on ProjectV2 { views(first: 50) { nodes { id name filter } } } } }`,
		{ project: project.id }
	).node.views.nodes;
	for (const v of planViewFilters(views, VIEWS)) {
		act(`view filter ${v.name} → ${v.filter || '(none)'}`, () => {
			ghGraphql(
				`mutation($id: ID!, $filter: String!) {
  updateProjectV2View(input: { viewId: $id, filter: $filter }) { clientMutationId } }`,
				{ id: v.id, filter: v.filter }
			);
		});
	}
}

syncLabels();
const project = ensureProject();
syncProject(project);

if (project) console.log(`Projet #${project.number} : ${project.url}`);
console.log(changes === 0 ? '✔ already up to date' : `✔ converged (${changes} changes)`);
