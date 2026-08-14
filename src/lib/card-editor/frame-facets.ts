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
 * Priorité d'affichage des familles : les plus classiques d'abord.
 *
 * `position_hint` est un ordre déclaré LOCAL à chaque famille, pas global — le
 * lire seul mettait `space-standard` (001, Sci-Fi) et `Xerent's Space Template`
 * (002) en tête de la bibliothèque, devant le cadre M15. On ordonne donc les
 * familles ici, et `position_hint` garde son rôle : trier À L'INTÉRIEUR d'une
 * famille, là où il est fiable.
 *
 * L'ordre va du cadre le plus courant au plus exotique : M15 est celui de toutes
 * les cartes imprimées depuis 2014, donc le point de départ attendu quand on
 * crée une carte aujourd'hui ; puis on remonte le temps, puis les variantes
 * officielles, et enfin les styles communautaires.
 *
 * Une famille absente de cette table prend `FAMILY_RANK_FALLBACK` : ajouter un
 * style au corpus ne demande donc aucun code, il atterrit simplement après les
 * familles officielles.
 */
const FAMILY_ORDER = [
	'm15 style',
	'new style',
	'old style',
	'tenth edition packaging style',
	'4th edition style',
	'classicshifted',
	'planeshifted',
	'future',
];

/** Rang des familles non listées : après toutes les officielles. */
const FAMILY_RANK_FALLBACK = FAMILY_ORDER.length;

/**
 * Namespaces de jeu observés en tête d'`installer_group`.
 *
 * Le corpus n'écrit pas le jeu de façon homogène : `magic` en minuscule pour
 * les 129 gabarits de cartes Magic, mais un nom capitalisé pour les autres
 * produits (`Magic Planes`, `Magic Archenemy`, `Magic Vanguard`, `Space`).
 *
 * La liste est FERMÉE et vérifiée sur le corpus : un préfixe inconnu est traité
 * comme une famille, pas comme un namespace. C'est le bon sens de l'erreur —
 * inventer un namespace ferait disparaître une famille réelle, alors qu'en
 * garder un de trop n'ajoute qu'une section au libellé un peu long.
 */
const GAME_NAMESPACES = new Set([
	'magic',
	'magic planes',
	'magic archenemy',
	'magic vanguard',
	"magic hero's path",
	'space',
]);

/**
 * Famille déclarée : premier segment du chemin qui n'est pas le namespace du jeu.
 *
 * La version précédente prenait le 2e segment en supposant que le 1er était
 * TOUJOURS le namespace. Faux pour 11 gabarits : `Magic Planes/normal style`
 * donnait la famille « normal style » (alors que c'est un plan, pas une carte
 * normale), `Space/Standard` donnait « Standard », `Magic Vanguard/Magic Online
 * style` donnait « Magic Online style ».
 *
 * Ces gabarits sont aujourd'hui écartés en amont par `frameOrigin` — le défaut
 * est donc invisible dans la bibliothèque actuelle. Il redeviendrait visible dès
 * que les cadres communautaires seraient rouverts, avec des plans et des
 * stratagèmes rangés sous des noms de familles de cartes.
 */
export function frameFamily(template: MseTemplate): string {
	const segments = (template.installerGroup ?? '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
	if (segments.length === 0) return UNKNOWN_FAMILY;
	const [first, ...rest] = segments;
	// Un chemin réduit au seul namespace (`magic`) n'a pas de famille à donner :
	// on garde le segment plutôt que de rendre `unknown`, il reste plus parlant.
	if (GAME_NAMESPACES.has(first.toLowerCase()) && rest.length > 0) return rest[0];
	return first;
}

/**
 * Clé i18n d'une famille, pour le titre de section du sélecteur.
 *
 * Le sélecteur affichait la chaîne BRUTE du corpus : « m15 style », « new
 * style », « 4th edition style » — du jargon anglais, à la casse incohérente
 * (`Future` et `Classicshifted` capitalisés, le reste en minuscules), dans une
 * interface par ailleurs entièrement traduite.
 *
 * Seules les familles OFFICIELLES sont traduites : ce sont les seules que la
 * bibliothèque propose aujourd'hui, et les seules dont le nom corresponde à une
 * réalité éditoriale stable (une époque d'impression Wizards). Les familles
 * communautaires gardent le nom que leur auteur leur a donné — le traduire
 * serait renommer le travail de quelqu'un d'autre.
 *
 * Rend `null` pour une famille sans clé : l'appelant affiche alors la chaîne du
 * corpus telle quelle.
 */
const FAMILY_LABEL_KEY = {
	'm15 style': 'familyM15',
	'new style': 'familyModern',
	'old style': 'familyOriginal',
	'tenth edition packaging style': 'familyTenth',
	'4th edition style': 'familyFourth',
	classicshifted: 'familyClassicshifted',
	planeshifted: 'familyPlaneshifted',
	future: 'familyFuture',
} as const satisfies Record<string, string>;

/**
 * Union LITTÉRALE des clés, et non `string` : `next-intl` type ses clés de
 * message, donc un `string` nu serait refusé par `t()`. Contourner par un cast
 * ferait perdre exactement la vérification qui garantit que chaque clé rendue
 * ici existe bien dans les deux locales.
 */
export type FamilyLabelKey = (typeof FAMILY_LABEL_KEY)[keyof typeof FAMILY_LABEL_KEY];

export function familyLabelKey(family: string): FamilyLabelKey | null {
	return (
		(FAMILY_LABEL_KEY as Record<string, FamilyLabelKey | undefined>)[family.toLowerCase()] ?? null
	);
}

/**
 * Rang de tri d'une famille. Plus petit = plus classique, donc plus haut.
 *
 * Les familles communautaires partagent toutes le même rang : elles ne sont pas
 * hiérarchisées entre elles (ce serait un jugement de valeur sur le travail
 * d'auteurs), seulement placées après les officielles. À rang égal, c'est
 * `position_hint` puis le libellé qui départagent.
 */
export function familyRank(template: MseTemplate): number {
	const index = FAMILY_ORDER.indexOf(frameFamily(template).toLowerCase());
	return index === -1 ? FAMILY_RANK_FALLBACK : index;
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

/**
 * Mots-clés à afficher en badge sous une vignette.
 *
 * Le corpus ne rédige pas ses `tags` : il DÉCOUPE le nom du gabarit en mots.
 * « Sci-Fi for Sync permanents » donne `fi, for, permanents, sci, sync`, « Name
 * on Right » donne `name, on, right`. Affichés tels quels sous le libellé, ces
 * badges répètent en fragments le nom écrit juste au-dessus, et occupent deux
 * lignes pour ne rien apprendre.
 *
 * On écarte donc tout mot déjà présent dans le libellé affiché. Ce qui reste est
 * la seule information que le nom ne porte pas : le mot-clé de forme composée
 * (`name_on_right`, `cards_with_big_text`) et les mots-clés de famille (`m15`).
 *
 * Le libellé est passé en paramètre plutôt que relu du gabarit : l'appelant l'a
 * déjà désambiguïsé (`buildFrameChoices` peut y ajouter le `short_name` ou
 * l'id), et c'est CE texte-là que l'utilisateur voit — c'est donc lui qui doit
 * décider de la redondance.
 */
export function displayableTags(tags: string[], label = ''): string[] {
	const lowered = label.toLocaleLowerCase();
	const labelWords = new Set(lowered.split(/[^\p{L}\p{Nd}]+/u).filter(Boolean));
	// Forme compacte du libellé, pour reconnaître aussi les mots-clés composés :
	// `name_on_right` et `nameonright` disent tous deux « Name on Right », que la
	// boucle par mot ne rattrape pas puisqu'aucun des deux n'est un mot du nom.
	const squashed = lowered.replaceAll(/[^\p{L}\p{Nd}]+/gu, '');
	const isRedundant = (tag: string): boolean =>
		labelWords.has(tag) || (squashed.length > 0 && squashed.includes(tag.replaceAll('_', '')));
	return tags.filter((tag) => !PHRASE_WORDS.has(tag) && !isRedundant(tag));
}

/** Compte d'occurrences de chaque mot-clé, pour le tri et les libellés. */
export function countTags(templates: MseTemplate[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const template of templates) {
		for (const tag of template.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return counts;
}
