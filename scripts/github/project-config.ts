/**
 * project-config.ts — État DÉSIRÉ des labels et du GitHub Project « Wizcard ».
 * Consommé par setup-project.ts (convergence idempotente).
 */
export type LabelSpec = { name: string; color: string; description: string };
export type FieldSpec = { name: string; kind: 'DATE' | 'ITERATION' };
export type ViewSpec = {
	name: string;
	layout: 'BOARD_LAYOUT' | 'TABLE_LAYOUT' | 'ROADMAP_LAYOUT';
	/** Filtre de la vue (syntaxe GitHub Projects) ; absent = aucun filtre. */
	filter?: string;
};

export const PROJECT = { owner: 'Elnop', repo: 'Elnop/Wizcard', title: 'Wizcard' };

/** Durée d'une itération, en jours. */
export const ITERATION_DURATION_DAYS = 14;

export const LABELS: LabelSpec[] = [
	{ name: 'epic', color: '5319e7', description: 'Epic : regroupe des user stories' },
	{ name: 'story', color: '0e8a16', description: 'User story' },
	{ name: 'bug', color: 'd73a4a', description: 'Bug' },
	{ name: 'chore', color: 'c5def5', description: 'Maintenance / outillage' },
	{
		name: 'needs-migration',
		color: 'fbca04',
		description: 'Migration prod à appliquer avant le déploiement',
	},
	{ name: 'needs-review', color: 'f9a03f', description: 'Revue humaine requise avant merge' },
];

export const STATUS_OPTIONS: string[] = [
	'Backlog',
	'Ready',
	'In progress',
	'In review',
	'Done (main)',
	'Deployed',
];

export const FIELDS: FieldSpec[] = [
	{ name: 'Début', kind: 'DATE' },
	{ name: 'Échéance', kind: 'DATE' },
	{ name: 'Itération', kind: 'ITERATION' },
];

export const VIEWS: ViewSpec[] = [
	{ name: 'Kanban', layout: 'BOARD_LAYOUT', filter: '-label:epic' },
	{ name: 'Par epic', layout: 'TABLE_LAYOUT' },
	{ name: 'À déployer', layout: 'TABLE_LAYOUT', filter: 'status:"Done (main)"' },
	{ name: 'Roadmap', layout: 'ROADMAP_LAYOUT', filter: 'label:epic' },
];
