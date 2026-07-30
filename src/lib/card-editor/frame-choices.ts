import { CARD_LAYOUTS } from './layout-registry';
import { frameFamily, frameOrigin, supportsCreature } from './frame-facets';
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
 * Tri : `position_hint` croissant, puis libellé en départage.
 *
 * C'est l'ordre DÉCLARÉ par les auteurs du corpus, présent sur les 109 gabarits
 * (001-907). Le tri alphabétique précédent l'écrasait et éclatait la chronologie
 * des cadres sur tout l'alphabet. La règle « CardConjurer d'abord » qui le
 * précédait ne triait rien : les 109 gabarits proposés sont tous `mse`.
 *
 * Un `position_hint` absent passe en fin de liste plutôt qu'en tête : `''` se
 * trierait avant `'001'`, ce qui remonterait les gabarits non déclarés.
 */
function sortByDeclaredOrder(choices: FrameChoice[]): void {
	choices.sort((a, b) => {
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

/** Construit la liste des apparences proposées : les cadres vendor mesurés. */
export function buildFrameChoices(templates: MseTemplate[]): FrameChoice[] {
	// « Aucun fallback » : un cadre sans géométrie MESURÉE n'est pas proposé.
	// Depuis le retrait des gabarits maison, cette règle décide de la totalité de
	// la liste — plus rien n'est rendu en dehors d'un cadre mesuré.
	const measured = templates.filter((template) => template.geometry !== null);
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
