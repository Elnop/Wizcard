import type { MseTemplate } from './mse-assets';

/**
 * Projections de lecture sur les facettes d'un gabarit.
 *
 * Rien n'est stocké ici : tout se dérive de colonnes déjà chargées. C'est
 * délibéré — une facette calculée ne peut pas diverger de sa source, et se
 * corrige en un commit sans repasser par `card-assets` (qui écrit en PROD).
 *
 * Le pendant `scripts/card-assets/frame-keywords.mjs` reste un fichier SÉPARÉ :
 * il lit le système de fichiers à l'ingestion. Les fusionner ferait entrer du
 * code Node dans un module client et casserait le build Turbopack.
 */

/** Familles reproduisant un cadre officiel Wizards. Le reste est communautaire. */
const OFFICIAL_FAMILIES = new Set([
	'old style',
	'new style',
	'm15 style',
	'future',
	'planeshifted',
	'classicshifted',
	'tenth edition packaging style',
	'4th edition style',
]);

/** Repli quand le chemin est absent ou trop court pour porter une famille. */
export const UNKNOWN_FAMILY = 'unknown';

/**
 * Famille déclarée : 2e segment du chemin (`magic/m15 style/...` -> `m15 style`).
 *
 * Le 1er segment est le namespace de jeu (`magic`, `Space`), constant ou
 * presque, donc sans pouvoir discriminant.
 */
export function frameFamily(template: MseTemplate): string {
	const segments = (template.installerGroup ?? '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
	return segments[1] ?? segments[0] ?? UNKNOWN_FAMILY;
}

/**
 * Officiel = reproduit un cadre Wizards ; custom = style d'auteur ou thématique.
 *
 * C'est le SEUL jugement de valeur du design : rien dans le corpus ne le
 * déclare. Il vit donc en code, dans la table ci-dessus, pour rester corrigeable
 * sans migration ni passage `card-assets`.
 */
export function frameOrigin(template: MseTemplate): 'official' | 'custom' {
	return OFFICIAL_FAMILIES.has(frameFamily(template).toLowerCase()) ? 'official' : 'custom';
}

/**
 * Le gabarit peut-il porter une créature ?
 *
 * Dérivé de la zone P/T MESURÉE, jamais stocké : `geometry` est déjà la vérité,
 * une colonne de plus pourrait en diverger.
 */
export function supportsCreature(template: MseTemplate): boolean {
	return Boolean(template.geometry?.boxes?.pt);
}

export function hasTag(template: MseTemplate, tag: string): boolean {
	return template.tags.includes(tag);
}

/** Mots-clés triés du plus RARE au plus commun, pour l'affichage en badges. */
export function rankTagsByRarity(tags: string[], counts: Map<string, number>): string[] {
	return [...tags].sort(
		(a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b)
	);
}

/**
 * Mots de phrase : présents dans les libellés MSE sans caractériser un cadre.
 *
 * Ils restent dans `tags` (donc cherchables — les écarter du stockage
 * demanderait de juger ce qui est un mot-clé), mais ne s'affichent pas en badge.
 */
const PHRASE_WORDS = new Set(['after', 'edition', 'frame', 'template', 'before', 'with']);

export function displayableTags(tags: string[]): string[] {
	return tags.filter((tag) => !PHRASE_WORDS.has(tag));
}

/** Compte d'occurrences de chaque mot-clé, pour le tri et les libellés. */
export function countTags(templates: MseTemplate[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const template of templates) {
		for (const tag of template.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return counts;
}
