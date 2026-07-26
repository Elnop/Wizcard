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

	// « Aucun fallback » appliqué à la liste : un cadre vendor sans géométrie
	// MESURÉE n'est pas proposé. Mieux vaut une bibliothèque plus courte que des
	// cartes dont le texte tombe à côté — c'est précisément le défaut que ce
	// chantier corrige. Les gabarits maison ne sont pas concernés : leur
	// géométrie est dessinée à la main, elle leur appartient.
	//
	// Le filtrage précède `disambiguateLabels` : désambiguïser sur l'ensemble
	// complet collerait un suffixe « · variante » à des cadres dont l'homonyme
	// n'est même pas affiché.
	const measured = templates.filter((template) => template.geometry !== null);

	const labels = disambiguateLabels(measured);
	const vendor: FrameChoice[] = measured.map((template) => ({
		key: `mse:${template.id}`,
		kind: sectionKindFor(template),
		label: labels.get(template.id) ?? template.name,
		layoutId: layoutForTemplate(template),
		mseTemplateId: template.id,
		template,
	}));

	// La liste est paginée par tranche sur SA position brute (voir le composant) :
	// si l'ordre ne suit pas déjà SECTION_ORDER, une tranche coupe une section en
	// plein milieu et en fait disparaître d'autres entièrement sans même afficher
	// leur en-tête. Trier ici garantit qu'une vue tronquée reste un PRÉFIXE correct
	// de la séquence des sections.
	const vendorBySection = new Map<FrameChoiceKind, FrameChoice[]>();
	for (const choice of vendor) {
		const bucket = vendorBySection.get(choice.kind);
		if (bucket) bucket.push(choice);
		else vendorBySection.set(choice.kind, [choice]);
	}
	for (const bucket of vendorBySection.values()) sortWithinSection(bucket);

	const orderedVendor = SECTION_ORDER.flatMap((kind) => vendorBySection.get(kind) ?? []);

	return [...house, ...orderedVendor];
}

/**
 * Tri intra-section : cadres CardConjurer d'abord, puis alphabétique sur le
 * libellé désambiguïsé (celui qu'on affiche — pas `name`, qui peut être un
 * doublon que le libellé a déjà résolu). Ne s'applique pas aux gabarits
 * maison : leur ordre dans le registre est signifiant (cf. buildFrameChoices).
 */
function sortWithinSection(choices: FrameChoice[]): void {
	choices.sort((a, b) => {
		const aIsCardConjurer = a.template?.source === 'cardconjurer';
		const bIsCardConjurer = b.template?.source === 'cardconjurer';
		if (aIsCardConjurer !== bIsCardConjurer) return aIsCardConjurer ? -1 : 1;
		return a.label.localeCompare(b.label);
	});
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
