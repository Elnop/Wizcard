/**
 * bmad.ts — Lecture PURE du `epics.md` produit par BMAD et rendu des corps
 * d'issue (formulaires epic.yml / story.yml). Consommé par sync-bmad.ts.
 *
 * Chaque issue porte un marqueur caché `<!-- bmad:epic:N -->` ou
 * `<!-- bmad:story:N.M -->` : c'est la clé d'appariement (le titre peut être
 * renommé sur GitHub sans créer de doublon).
 */

export type BmadStory = {
	key: string; // "1.2"
	title: string;
	role: string;
	want: string;
	benefit: string;
	criteria: string;
	notes: string;
};
export type BmadEpic = { key: string; title: string; goal: string; stories: BmadStory[] };

const EPIC_HEADING = /^## +Epic +(\d+) *:(.*)$/i;
const STORY_HEADING = /^### +Story +(\d+)\.(\d+) *:(.*)$/i;
const CRITERIA_HEADING = /^(?:acceptance criteria|crit[èe]res d['’]acceptation)$/i;
const ROLE = /^(?:as an? |en tant que |en tant qu['’])(.*)$/i;
const WANT = /^(?:i want to |i want |je veux |je souhaite )(.*)$/i;
const BENEFIT = /^(?:so that |afin de |afin que |afin d['’]|afin qu['’]|pour que )(.*)$/i;
const MARKER = /<!--\s*bmad:(epic|story):(\d+(?:\.\d+)?)\s*-->/;

const NO_RESPONSE = '_No response_';
const TBD = 'À préciser à la prise en charge.';

export const epicKey = (n: string) => `epic:${n}`;
export const storyKey = (n: string) => `story:${n}`;
const marker = (key: string) => `<!-- bmad:${key} -->`;

/** Clé `epic:N` / `story:N.M` portée par un corps d'issue, sinon null. */
export function markerOf(body: string): string | null {
	const m = MARKER.exec(body);
	return m ? `${m[1]}:${m[2]}` : null;
}

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');
/** Ligne sans gras, espaces réduits, sans virgule/point final. */
const clean = (s: string) =>
	s.replaceAll('**', '').replace(/\s+/g, ' ').trim().replace(/[,.]$/, '').trim();
/** `**Acceptance Criteria:**`, `**Critères d'acceptation :**`… */
const isCriteriaHeading = (l: string) => CRITERIA_HEADING.test(clean(l.replaceAll(':', '')));

function parseStory(key: string, title: string, lines: string[]): BmadStory {
	let role = '';
	let want = '';
	let benefit = '';
	const notes: string[] = [];
	const at = lines.findIndex(isCriteriaHeading);
	const head = at === -1 ? lines : lines.slice(0, at);
	for (const raw of head) {
		const l = clean(raw);
		let m: RegExpExecArray | null;
		if (!role && (m = ROLE.exec(l))) role = m[1];
		else if (!want && (m = WANT.exec(l))) want = m[1];
		else if (!benefit && (m = BENEFIT.exec(l))) benefit = m[1];
		else notes.push(raw);
	}
	const criteria =
		at === -1
			? ''
			: lines
					.slice(at + 1)
					.join('\n')
					.trim();
	if (!want) throw new Error(`Story ${key} : ligne « Je veux / I want » introuvable`);
	if (!criteria) throw new Error(`Story ${key} : critères d'acceptation introuvables`);
	return { key, title, role, want, benefit, criteria, notes: notes.join('\n').trim() };
}

/**
 * Epics et stories de `epics.md` (gabarit bmad-create-epics-and-stories,
 * en-têtes anglais ou français). Lève sur une clé dupliquée ou une story
 * rangée sous une autre epic que son numéro.
 */
export function parseEpics(markdown: string): BmadEpic[] {
	const epics: BmadEpic[] = [];
	const seen = new Set<string>();
	let epic: BmadEpic | null = null;
	let goal: string[] = [];
	let story: { key: string; title: string; lines: string[] } | null = null;

	const closeStory = () => {
		if (story && epic) epic.stories.push(parseStory(story.key, story.title, story.lines));
		story = null;
	};
	const closeEpic = () => {
		closeStory();
		if (epic && !epic.goal) epic.goal = goal.join('\n').trim();
		epic = null;
	};
	const claim = (key: string) => {
		if (seen.has(key)) throw new Error(`Clé BMAD dupliquée dans epics.md : ${key}`);
		seen.add(key);
	};

	for (const line of stripComments(markdown).split('\n')) {
		const e = EPIC_HEADING.exec(line);
		const s = STORY_HEADING.exec(line);
		if (e) {
			closeEpic();
			claim(epicKey(e[1]));
			epic = { key: e[1], title: e[2].trim(), goal: '', stories: [] };
			epics.push(epic);
			goal = [];
		} else if (s) {
			const current: BmadEpic | null = epic;
			if (!current || current.key !== s[1]) {
				throw new Error(`Story ${s[1]}.${s[2]} hors de son epic (${current?.key ?? 'aucune'})`);
			}
			closeStory();
			if (!current.goal) current.goal = goal.join('\n').trim();
			claim(storyKey(`${s[1]}.${s[2]}`));
			story = { key: `${s[1]}.${s[2]}`, title: s[3].trim(), lines: [] };
		} else if (/^##\s/.test(line)) {
			closeEpic();
		} else if (story) {
			story.lines.push(line);
		} else if (epic) {
			goal.push(line);
		}
	}
	closeEpic();
	return epics;
}

const section = (label: string, value: string) => `### ${label}\n\n${value || NO_RESPONSE}`;

export const epicTitle = (e: BmadEpic) => `[Epic] ${e.title}`;
export const storyTitle = (s: BmadStory) => `[US] ${s.title}`;

export function renderEpicBody(e: BmadEpic): string {
	return [
		section('Objectif', e.goal || TBD),
		section('Valeur / pourquoi', ''),
		section('Hors périmètre', ''),
		section('Critères de fin', ''),
		marker(epicKey(e.key)),
	].join('\n\n');
}

export function renderStoryBody(s: BmadStory): string {
	return [
		section('En tant que', s.role),
		section('Je veux', s.want),
		section('Afin de', s.benefit),
		section("Critères d'acceptation", s.criteria),
		section('Notes techniques', s.notes || TBD),
		marker(storyKey(s.key)),
	].join('\n\n');
}

/** Epics/stories sans issue ; appariement par marqueur. Création seule. */
export function planBmadSync(
	existingKeys: Set<string>,
	epics: BmadEpic[]
): { createEpics: BmadEpic[]; createStories: { epic: BmadEpic; story: BmadStory }[] } {
	return {
		createEpics: epics.filter((e) => !existingKeys.has(epicKey(e.key))),
		createStories: epics.flatMap((epic) =>
			epic.stories
				.filter((story) => !existingKeys.has(storyKey(story.key)))
				.map((story) => ({ epic, story }))
		),
	};
}
