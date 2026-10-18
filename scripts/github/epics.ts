/**
 * epics.ts — Epics et tickets enfants à créer au démarrage du workflow.
 * Consommé par file-epics.ts (idempotent, appariement par titre exact).
 */
export type StorySpec = { title: string; label: 'story' | 'bug' | 'chore'; body: string };
export type EpicSpec = { title: string; body: string; children: StorySpec[] };

export const EPICS: EpicSpec[] = [
	{
		title: `[Epic] Workflow ③ — Board GitHub Project`,
		body: `### Objectif

Mettre en place le board GitHub Project « Wizcard », les labels, les formulaires d'issue et le template de PR.

### Valeur / pourquoi

Rendre le travail visible et ordonné : tickets → PR → déploiement, sur un seul board.

### Hors périmètre

Les règles de branche et les Actions (epic ②) ; BMAD (epic ④).

### Critères de fin

Project, labels, formulaires et template de PR en place ; vues et automatisations réglées dans l'UI.`,
		children: [
			{
				title: `[US] Créer le Project, les labels et les vues`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

un script idempotent qui crée le Project, ses champs, ses vues et les labels

### Afin de

avoir un board reproductible sans manipulation manuelle

### Critères d'acceptation

- \`npm run gh:setup\` converge puis répond « already up to date » au second lancement

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Formulaires d'issue et template de PR`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

des formulaires d'issue (epic, story, bug, chore) et un template de PR en français

### Afin de

que chaque ticket et chaque PR soient structurés de la même façon

### Critères d'acceptation

- Formulaires présents dans \`.github/ISSUE_TEMPLATE\`
- Template de PR présent dans \`.github/pull_request_template.md\`

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Configurer les vues et automatisations dans l'UI`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

régler à la main les filtres, regroupements et workflows du Project

### Afin de

compléter ce que l'API GraphQL ne permet pas de configurer

### Critères d'acceptation

- Filtres/regroupements des vues réglés
- Workflows natifs (ajout auto, statut) activés

### Notes techniques

À préciser à la prise en charge.`,
			},
		],
	},
	{
		title: `[Epic] Workflow ① — npm run check au vert`,
		body: `### Objectif

Rendre \`npm run check\` (TypeScript + ESLint + Prettier) vert sur la branche principale.

### Valeur / pourquoi

Pouvoir exiger un check vert en CI sans bruit hérité.

### Hors périmètre

Nouvelles règles de lint.

### Critères de fin

\`npm run check\` et \`npm run build\` passent sur main.`,
		children: [
			{
				title: `[Chore] Corriger les problèmes ESLint/Prettier/TS préexistants`,
				label: 'chore',
				body: `### Objectif

Corriger la soixantaine de problèmes préexistants dans des fichiers sans rapport.

### Critères de fin

- \`npm run check\` sans erreur`,
			},
			{
				title: `[Chore] Vérifier npm run build`,
				label: 'chore',
				body: `### Objectif

Vérifier que \`npm run build\` passe (certaines erreurs TS n'apparaissent qu'au build).

### Critères de fin

- \`npm run build\` sans erreur`,
			},
		],
	},
	{
		title: `[Epic] Workflow ② — Règles de branche et Actions`,
		body: `### Objectif

Faire respecter le workflow par des rulesets et des GitHub Actions : CI, politique de PR, revue, garde de déploiement.

### Valeur / pourquoi

Empêcher les contournements du workflow et sécuriser les déploiements en prod.

### Hors périmètre

Le board (epic ③) ; BMAD (epic ④).

### Critères de fin

Rulesets main/deploy actifs, Actions en place, procédure de release documentée.`,
		children: [
			{
				title: `[US] CI check + build sur les PR`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

une CI qui lance check et build sur chaque PR

### Afin de

détecter les régressions avant le merge

### Critères d'acceptation

- Check et build exécutés sur chaque PR

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Action pr-policy (branche + Closes #N)`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

une Action qui vérifie le nom de branche et la présence de \`Closes #N\`

### Afin de

que chaque PR soit rattachée à un ticket

### Critères d'acceptation

- PR sans ticket ou mal nommée bloquée

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Action review-gate`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

une Action qui exige une revue quand le label \`needs-review\` est posé

### Afin de

sécuriser les changements RLS/auth/migrations

### Critères d'acceptation

- Merge bloqué tant que la revue manque

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Action deploy-guard + liste des migrations + statut Deployed`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

une Action qui garde le déploiement, liste les migrations à appliquer et passe les tickets en Deployed

### Afin de

ne pas déployer sans migration prod appliquée

### Critères d'acceptation

- Liste des migrations produite
- Statut Deployed mis à jour

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Rulesets main/deploy et méthodes de merge`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

des rulesets sur main et deploy et des méthodes de merge restreintes

### Afin de

protéger les branches importantes

### Critères d'acceptation

- Rulesets actifs et vérifiés

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Procédure de release dans AGENTS.md`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

une procédure de release documentée dans AGENTS.md

### Afin de

rendre la release reproductible

### Critères d'acceptation

- Section release présente dans AGENTS.md

### Notes techniques

À préciser à la prise en charge.`,
			},
		],
	},
	{
		title: `[Epic] Workflow ④ — BMAD sur Wizcard`,
		body: `### Objectif

Installer BMAD sur Wizcard et le brancher sur le board et les règles de branche/PR.

### Valeur / pourquoi

Structurer la planification et le développement par agents, en cohérence avec le workflow.

### Hors périmètre

Réécrire BMAD.

### Critères de fin

BMAD installé en version figée, synchronisé avec les issues.`,
		children: [
			{
				title: `[US] Installer BMAD (version figée) et désactiver superpowers pour le projet`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

BMAD installé en version figée et superpowers désactivé sur ce projet

### Afin de

éviter deux méthodes concurrentes

### Critères d'acceptation

- Version BMAD figée
- superpowers désactivé pour le projet

### Notes techniques

À préciser à la prise en charge.`,
			},
			{
				title: `[US] Script de synchro BMAD → issues`,
				label: 'story',
				body: `### En tant que

Le développeur

### Je veux

un script qui synchronise les artefacts BMAD vers des issues

### Afin de

garder le board aligné avec la planification

### Critères d'acceptation

- Synchro idempotente des epics/stories en issues

### Notes techniques

À préciser à la prise en charge.`,
			},
		],
	},
	{
		title: `[Epic] Workflow ⑤ — Tri de l'existant`,
		body: `### Objectif

Trier l'existant : issues ouvertes, branches locales et chantiers en cours.

### Valeur / pourquoi

Repartir d'un état propre où tout travail est tracé dans le board.

### Hors périmètre

Terminer les chantiers eux-mêmes.

### Critères de fin

Issues rattachées, branches triées, un epic par chantier en cours.`,
		children: [
			{
				title: `[Chore] Rattacher les issues #4–#7`,
				label: 'chore',
				body: `### Objectif

Labelliser les issues #4 à #7, les rattacher à des epics et les ajouter au Project.

### Critères de fin

- Issues #4–#7 labellisées, rattachées et dans le Project`,
			},
			{
				title: `[Chore] Trier les branches locales`,
				label: 'chore',
				body: `### Objectif

Pour chaque branche locale (~18) : fusionnée, abandonnée ou encore pertinente ; supprimer les fusionnées, lister le reste pour décision (ne jamais supprimer du travail non fusionné sans confirmation).

### Critères de fin

- Branches fusionnées supprimées
- Reste listé pour décision`,
			},
			{
				title: `[Chore] Epics des chantiers en cours`,
				label: 'chore',
				body: `### Objectif

Créer un epic par chantier en cours, avec ses stories restantes connues :

- Catalogue Scryfall : vagues 1c-n et sous-projet 2 (fraîcheur)
- Modèle de domaine Card
- Profils utilisateurs
- Seed prod des cartes localisées
- Migration prod de l'index de collection
- Migration prod de l'empilement de cartes / édition en masse
- Seeds prod du studio

Les migrations prod en attente deviennent des items \`needs-migration\` dans « To deploy ».

### Critères de fin

- Un epic par chantier, avec ses stories
- Migrations en attente marquées \`needs-migration\``,
			},
		],
	},
];
