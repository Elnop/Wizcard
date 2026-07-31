import { CARD_LAYOUTS } from './layout-registry';
import { familyRank, frameFamily, frameOrigin, supportsCreature } from './frame-facets';
import type { MseTemplate } from './mse-assets';
import type { CardLayoutId } from './types';

/**
 * Une entrée de la liste d'apparences.
 *
 * Choisir une entrée écrit `mseTemplateId` ET `layoutId` d'un seul coup, ils ne
 * peuvent donc pas diverger — le studio a eu deux sélecteurs concurrents qui
 * s'écrasaient l'un l'autre.
 *
 * La liste ne contient QUE des cadres vendor. Les 8 gabarits « maison » dessinés
 * en SVG ont été retirés : leur rendu (panneaux flottants aux coins arrondis,
 * dégradé diagonal, texture rayée) ne tenait pas la comparaison avec les cadres
 * mesurés posés à côté d'eux dans la même grille.
 */
export interface FrameChoice {
	/** Identité stable dans la liste (clé React et cible de comparaison). */
	key: string;
	/** Famille déclarée, 2e segment du chemin MSE. Remplace `kind`. */
	family: string;
	/** Libellé affiché, déjà désambiguïsé (cf. buildFrameChoices). */
	label: string;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	template: MseTemplate;
}

export interface FrameChoiceSection {
	family: string;
	choices: FrameChoice[];
}

export interface FrameFilters {
	family: string | null;
	/** Mots-clés cumulés en ET. */
	tags: string[];
	origin: 'official' | 'custom' | null;
	orientation: 'portrait' | 'landscape' | null;
	creature: boolean | null;
}

export const DEFAULT_FRAME_FILTERS: FrameFilters = {
	family: null,
	tags: [],
	origin: null,
	orientation: null,
	creature: null,
};

export function hasActiveFilters(filters: FrameFilters): boolean {
	return (
		filters.family !== null ||
		filters.tags.length > 0 ||
		filters.origin !== null ||
		filters.orientation !== null ||
		filters.creature !== null
	);
}

/**
 * Tri : famille d'abord (la plus classique en tête), puis `position_hint`
 * croissant, puis libellé en départage.
 *
 * `position_hint` est l'ordre DÉCLARÉ par les auteurs du corpus, présent sur les
 * 109 gabarits (001-907). Le tri alphabétique d'origine l'écrasait et éclatait
 * la chronologie des cadres sur tout l'alphabet.
 *
 * Mais cet ordre est LOCAL à chaque famille, pas global : s'y fier seul plaçait
 * `space-standard` (001, un cadre Sci-Fi) et `Xerent's Space Template` (002) en
 * tête de la bibliothèque, devant le cadre M15 — et intercalait `Ultima Spells`
 * au milieu des M15. D'où le rang de famille en clé primaire (cf. `familyRank`),
 * qui remet les cadres les plus courants en premier ; `position_hint` garde son
 * rôle à l'intérieur d'une famille, là où il est fiable.
 *
 * Un `position_hint` absent passe en fin de SA famille plutôt qu'en tête : `''`
 * se trierait avant `'001'`, ce qui remonterait les gabarits non déclarés.
 */
function sortByDeclaredOrder(choices: FrameChoice[]): void {
	choices.sort((a, b) => {
		const rankDelta = familyRank(a.template) - familyRank(b.template);
		if (rankDelta !== 0) return rankDelta;
		// Même rang : familles officielles distinctes impossibles (chaque famille a
		// son rang), donc on est soit dans la même famille, soit entre deux
		// communautaires. On regroupe alors par nom de famille pour que les
		// sections restent contiguës.
		const familyDelta = a.family.localeCompare(b.family);
		if (familyDelta !== 0) return familyDelta;
		const aHint = a.template.positionHint ?? '￿';
		const bHint = b.template.positionHint ?? '￿';
		if (aHint !== bHint) return aHint.localeCompare(bHint);
		return a.label.localeCompare(b.label);
	});
}

/**
 * Désambiguïsation des noms vendor, en trois paliers successifs.
 *
 * Le catalogue est un dump : 15 noms couvrent 39 lignes, « After 8th edition »
 * apparaît 7 fois à l'identique. Tant que ces cadres vivaient derrière un onglet
 * secondaire on pouvait s'en accommoder ; ils deviennent ici le vocabulaire
 * principal, donc chaque ligne doit porter un libellé unique.
 *
 * 1. `name` seul quand il est déjà unique ;
 * 2. `name · short_name` sinon ;
 * 3. `name · short_name (id)` pour les trois paires où short_name se répète
 *    aussi (magic-textless / magic-new-textless, etc.).
 */
function disambiguateLabels(templates: MseTemplate[]): Map<string, string> {
	const nameCounts = new Map<string, number>();
	for (const template of templates) {
		nameCounts.set(template.name, (nameCounts.get(template.name) ?? 0) + 1);
	}

	const baseLabel = (template: MseTemplate): string => {
		if ((nameCounts.get(template.name) ?? 0) <= 1) return template.name;
		const short = template.shortName?.trim();
		return short ? `${template.name} · ${short}` : template.name;
	};

	const baseCounts = new Map<string, number>();
	for (const template of templates) {
		const base = baseLabel(template);
		baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
	}

	const labels = new Map<string, string>();
	for (const template of templates) {
		const base = baseLabel(template);
		labels.set(template.id, (baseCounts.get(base) ?? 0) <= 1 ? base : `${base} (${template.id})`);
	}
	return labels;
}

/**
 * Mots-clés dont les cadres sont retirés de la bibliothèque, PROVISOIREMENT.
 *
 * Chacune de ces familles suppose une carte que le studio ne sait pas encore
 * décrire, pour l'une de trois raisons :
 *
 * - DEUX FACES là où le brouillon n'en porte qu'une : `flip`, `double_faced`.
 * - UNE BOÎTE DE TEXTE SEGMENTÉE, qu'un seul champ de règles ne peut pas
 *   remplir : `planeswalker` (capacités à loyauté), `leveler` (paliers de
 *   niveau, chacun avec ses propres P/T), `split` (deux moitiés, chacune avec
 *   son nom, son coût et ses règles).
 * - UN ÉTAT DE JEU qu'aucun champ ne porte : `tapped`, dont le cadre est dessiné
 *   incliné pour une carte engagée.
 * - PAS DE PLACE POUR LE TEXTE : `tome`/`tomes`, dont la boîte de règles MESURÉE
 *   fait 29 px de haut (contre ~200 sur un cadre normal). Le cadre est conçu
 *   pour une seule ligne ; tout texte de règles ordinaire déborde.
 *
 * Leur géométrie est bien mesurée — ils passaient donc le filtre
 * `geometry !== null` — mais le rendu qui en sortait était faux, pas dégradé.
 *
 * L'exclusion vit en code, comme `frameOrigin` et pour la même raison : elle se
 * lève en un commit, sans migration ni passage `card-assets` (qui écrit en
 * PROD). Les lignes restent en base, intactes et toujours mesurées.
 *
 * Les mots-clés sont ceux DÉCLARÉS par le corpus, pas un motif de nom : 43 des
 * 109 gabarits que la bibliothèque proposait en portent au moins un, d'où les 66
 * restants. `flips`, `levelers` et `splits` ne sont pas listés — aucun gabarit ne
 * les porte sans porter aussi le singulier. `tomes` l'est parce que le seul
 * gabarit concerné (`magic-new-tome`) déclare les deux formes.
 */
const UNSUPPORTED_TAGS = [
	'planeswalker',
	'flip',
	'double_faced',
	'leveler',
	'split',
	'tapped',
	'tome',
	'tomes',
];

/**
 * Ce gabarit est-il retiré de la bibliothèque ? (cf. `UNSUPPORTED_TAGS`)
 *
 * Exporté pour que l'auto-réparation du studio partage LE MÊME critère que la
 * liste : un brouillon resté sur un cadre exclu doit être ramené vers le cadre
 * par défaut. Sans ça il continuerait d'être peint tout en étant introuvable
 * dans le sélecteur — donc impossible à retrouver après en avoir changé.
 */
export function isUnsupportedFrame(template: MseTemplate): boolean {
	return UNSUPPORTED_TAGS.some((tag) => template.tags.includes(tag));
}

/** Construit la liste des apparences proposées : les cadres vendor mesurés. */
export function buildFrameChoices(templates: MseTemplate[]): FrameChoice[] {
	// « Aucun fallback » : un cadre sans géométrie MESURÉE n'est pas proposé.
	// Depuis le retrait des gabarits maison, cette règle décide de la totalité de
	// la liste — plus rien n'est rendu en dehors d'un cadre mesuré.
	const measured = templates.filter(
		(template) => template.geometry !== null && !isUnsupportedFrame(template)
	);
	const labels = disambiguateLabels(measured);

	const choices: FrameChoice[] = measured.map((template) => ({
		key: `mse:${template.id}`,
		family: frameFamily(template),
		label: labels.get(template.id) ?? template.name,
		layoutId: layoutForTemplate(template),
		mseTemplateId: template.id,
		template,
	}));

	sortByDeclaredOrder(choices);
	return choices;
}

/**
 * Géométrie déduite du cadre. Ne dépend pas de mse-assets (qui est un module
 * client) : ce fichier reste pur pour rester lisible et réutilisable.
 *
 * La branche `planeswalker` est INJOIGNABLE tant que `UNSUPPORTED_TAGS` la
 * retire en amont — elle est gardée telle quelle parce qu'elle redeviendra la
 * classification juste le jour où l'exclusion sera levée. La supprimer ferait
 * silencieusement tomber ces cadres en `arcana`.
 */
function layoutForTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId && template.layoutId in CARD_LAYOUTS) return template.layoutId;
	if (template.tags.includes('planeswalker')) return 'planeswalker';
	if (template.tags.includes('token')) return 'token';
	if (template.tags.includes('saga')) return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}

export function applyFrameFilters(choices: FrameChoice[], filters: FrameFilters): FrameChoice[] {
	return choices.filter((choice) => {
		if (filters.family !== null && choice.family !== filters.family) return false;
		// Mots-clés cumulés en ET : chaque mot-clé ajouté restreint.
		if (!filters.tags.every((tag) => choice.template.tags.includes(tag))) return false;
		if (filters.origin !== null && frameOrigin(choice.template) !== filters.origin) return false;
		if (filters.orientation !== null && choice.template.orientation !== filters.orientation) {
			return false;
		}
		if (filters.creature !== null && supportsCreature(choice.template) !== filters.creature) {
			return false;
		}
		return true;
	});
}

/**
 * Sections par famille, dans l'ordre d'apparition — donc celui de
 * `position_hint`, puisque la liste est déjà triée. Pas d'ordre codé en dur : le
 * corpus déclare 30 familles et en ajouter une ne doit demander aucun code.
 */
export function groupFrameChoices(choices: FrameChoice[]): FrameChoiceSection[] {
	const sections: FrameChoiceSection[] = [];
	const byFamily = new Map<string, FrameChoice[]>();
	for (const choice of choices) {
		const bucket = byFamily.get(choice.family);
		if (bucket) {
			bucket.push(choice);
		} else {
			const created = [choice];
			byFamily.set(choice.family, created);
			sections.push({ family: choice.family, choices: created });
		}
	}
	return sections;
}

/**
 * Recherche en PRÉFIXE DE MOT, sur toutes les sources.
 *
 * Volontairement plus permissive que la classification : on cherche pendant la
 * frappe, donc « plan » doit remonter « planeswalker ». Ancrer sur le début du
 * mot suffit à écarter la collision qui a motivé ce chantier (« box » ne doit
 * pas remonter « Textbox »).
 */
export function matchesQuery(choice: FrameChoice, query: string): boolean {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return true;
	const haystack = [
		choice.label,
		choice.template.name,
		choice.template.shortName ?? '',
		choice.template.id,
		choice.template.installerGroup ?? '',
		choice.template.tags.join(' '),
	]
		.join(' ')
		.toLocaleLowerCase();
	return haystack.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle));
}

/**
 * Entrée active : le cadre dont l'id vaut `mseTemplateId` — c'est lui que le
 * canvas peint réellement, donc lui que l'utilisateur voit. `null` si le
 * brouillon pointe un cadre absent de la liste (retiré du catalogue, non mesuré,
 * ou l'ancien sentinel maison) ; CardEditorStudio le récupère alors vers le
 * cadre par défaut.
 */
export function findActiveChoice(
	choices: FrameChoice[],
	mseTemplateId: string
): FrameChoice | null {
	return choices.find((choice) => choice.mseTemplateId === mseTemplateId) ?? null;
}
