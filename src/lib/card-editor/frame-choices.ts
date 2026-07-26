import { CARD_LAYOUTS } from './layout-registry';
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
	kind: FrameChoiceKind;
	/** Libellé affiché, déjà désambiguïsé (cf. buildFrameChoices). */
	label: string;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	template: MseTemplate;
}

export type FrameChoiceKind =
	'card' | 'planeswalker' | 'split' | 'double-faced' | 'token' | 'other';

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

/** Construit la liste des apparences proposées : les cadres vendor mesurés. */
export function buildFrameChoices(templates: MseTemplate[]): FrameChoice[] {
	// « Aucun fallback » appliqué à la liste : un cadre sans géométrie MESURÉE
	// n'est pas proposé. Mieux vaut une bibliothèque plus courte que des cartes
	// dont le texte tombe à côté — c'est précisément le défaut que ce chantier
	// corrige.
	//
	// Depuis le retrait des gabarits maison, cette règle décide de la totalité de
	// la liste : plus rien n'est rendu en dehors d'un cadre mesuré.
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
	const bySection = new Map<FrameChoiceKind, FrameChoice[]>();
	for (const choice of vendor) {
		const bucket = bySection.get(choice.kind);
		if (bucket) bucket.push(choice);
		else bySection.set(choice.kind, [choice]);
	}
	for (const bucket of bySection.values()) sortWithinSection(bucket);

	return SECTION_ORDER.flatMap((kind) => bySection.get(kind) ?? []);
}

/**
 * Tri intra-section : cadres CardConjurer d'abord, puis alphabétique sur le
 * libellé désambiguïsé (celui qu'on affiche — pas `name`, qui peut être un
 * doublon que le libellé a déjà résolu).
 */
function sortWithinSection(choices: FrameChoice[]): void {
	choices.sort((a, b) => {
		const aIsCardConjurer = a.template.source === 'cardconjurer';
		const bIsCardConjurer = b.template.source === 'cardconjurer';
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
