import { CARD_LAYOUTS } from './layout-registry';
import type { MseTemplate } from './mse-assets';
import { HOUSE_FRAME_TEMPLATE_ID, type CardLayoutId } from './types';

/**
 * Une entrée de la liste unique d'apparences.
 *
 * Le studio proposait deux sélecteurs concurrents — les 8 gabarits maison et les
 * 206 cadres vendor — qui écrivaient tous deux `layoutId`, le second écrasant
 * silencieusement le premier. Ils fusionnent ici en une seule liste : choisir une
 * entrée écrit les DEUX champs d'un coup, ils ne peuvent donc plus diverger.
 */
export interface FrameChoice {
	/** Identité stable dans la liste (clé React et cible de comparaison). */
	key: string;
	kind: FrameChoiceKind;
	/** Libellé affiché, déjà désambiguïsé (cf. buildFrameChoices). */
	label: string;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	/** null pour un gabarit maison : il n'a pas de cadre vendor. */
	template: MseTemplate | null;
}

export type FrameChoiceKind =
	'house' | 'card' | 'planeswalker' | 'split' | 'double-faced' | 'token' | 'other';

export interface FrameChoiceSection {
	kind: FrameChoiceKind;
	choices: FrameChoice[];
}

/**
 * Ordre des sections. `other` ferme la marche : il absorbe la traîne (packaging,
 * saga, oversized — 1 à 2 entrées chacun), pour ne pas afficher un en-tête de
 * section au-dessus d'une seule ligne.
 */
const SECTION_ORDER: FrameChoiceKind[] = [
	'house',
	'card',
	'planeswalker',
	'split',
	'double-faced',
	'token',
	'other',
];

const VENDOR_KINDS = new Set<FrameChoiceKind>([
	'card',
	'planeswalker',
	'split',
	'double-faced',
	'token',
]);

function sectionKindFor(template: MseTemplate): FrameChoiceKind {
	return VENDOR_KINDS.has(template.kind as FrameChoiceKind)
		? (template.kind as FrameChoiceKind)
		: 'other';
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
 * Construit la liste unique : gabarits maison d'abord, puis cadres vendor.
 *
 * `layoutIds` est injecté plutôt que lu de CARD_LAYOUT_LIST pour que l'appelant
 * garde la main sur ce qui est proposé (le studio masque `landscape`).
 */
export function buildFrameChoices(
	templates: MseTemplate[],
	layoutIds: readonly CardLayoutId[]
): FrameChoice[] {
	const house: FrameChoice[] = layoutIds.map((layoutId) => ({
		key: `house:${layoutId}`,
		kind: 'house',
		// Le libellé maison vient des messages i18n, côté composant : on stocke
		// l'id, que l'appelant traduit via `cardEditor.layouts.<id>.name`.
		label: layoutId,
		layoutId,
		mseTemplateId: HOUSE_FRAME_TEMPLATE_ID,
		template: null,
	}));

	const labels = disambiguateLabels(templates);
	const vendor: FrameChoice[] = templates.map((template) => ({
		key: `mse:${template.id}`,
		kind: sectionKindFor(template),
		label: labels.get(template.id) ?? template.name,
		layoutId: layoutForTemplate(template),
		mseTemplateId: template.id,
		template,
	}));

	return [...house, ...vendor];
}

/**
 * Géométrie déduite du cadre. Reprend la règle de `layoutForMseTemplate`, mais
 * sans dépendre de mse-assets (qui est un module client) : ce fichier reste pur
 * pour rester lisible et réutilisable.
 */
function layoutForTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId && template.layoutId in CARD_LAYOUTS) return template.layoutId;
	if (template.kind === 'token') return 'token';
	if (template.kind === 'planeswalker') return 'planeswalker';
	if (template.kind === 'saga') return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}

/** Regroupe en sections, dans l'ordre fixe ci-dessus ; les vides sont omises. */
export function groupFrameChoices(choices: FrameChoice[]): FrameChoiceSection[] {
	return SECTION_ORDER.map((kind) => ({
		kind,
		choices: choices.filter((choice) => choice.kind === kind),
	})).filter((section) => section.choices.length > 0);
}

/**
 * Entrée active, résolue dans cet ordre :
 *
 * 1. sentinel maison -> le gabarit dont l'id vaut `layoutId` ;
 * 2. sinon le cadre vendor dont l'id vaut `mseTemplateId` — c'est lui que le
 *    canvas peint réellement, donc lui que l'utilisateur voit ;
 * 3. rien, si le brouillon pointe un cadre retiré du catalogue.
 *
 * Aucune migration au chargement : un vieux brouillon n'est jamais réécrit tant
 * que l'utilisateur n'a pas choisi lui-même.
 */
export function findActiveChoice(
	choices: FrameChoice[],
	layoutId: CardLayoutId,
	mseTemplateId: string
): FrameChoice | null {
	if (mseTemplateId === HOUSE_FRAME_TEMPLATE_ID) {
		return (
			choices.find((choice) => choice.kind === 'house' && choice.layoutId === layoutId) ?? null
		);
	}
	return choices.find((choice) => choice.mseTemplateId === mseTemplateId) ?? null;
}
