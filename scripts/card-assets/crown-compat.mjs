// scripts/card-assets/crown-compat.mjs
//
// Décide quels gabarits acceptent la couronne légendaire, et construit leurs
// chemins d'assets.
//
// La couronne du corpus est dessinée pour la barre de titre M15. Elle occupe la
// bande y=10..102 (mesuré sur l'alpha de wcrown.png), c'est-à-dire exactement la
// zone du titre — donc c'est la BOÎTE DU NOM qui décide de l'alignement, pas la
// famille du cadre.
//
// Vérifié dans les deux sens en composant la couronne sur de vrais cadres :
// m15/new/tenth/classicshifted s'alignent (même boîte de nom) ; old, veryold,
// future, megaman, nokiou et horror voient la couronne écraser leur titre
// (boîtes différentes).
//
// Contre-exemple utile : les cadres PRÉ-M15 ne sont pas tous incompatibles.
// `new style` et `tenth` réutilisent la géométrie de titre M15 et acceptent la
// couronne. Filtrer par nom de famille donnerait un mauvais périmètre.

/** Dimensions natives des couronnes du corpus. */
const CROWN_CARD_WIDTH = 375;
const CROWN_CARD_HEIGHT = 523;

/** Boîte du nom de `magic-m15`, la référence d'alignement. */
export const CROWN_REFERENCE_NAME_BOX = {
	left: 32,
	top: 30,
	width: 279.2752808988764,
	height: 23,
};

/** Tolérance de comparaison : les valeurs viennent du même extracteur. */
const BOX_TOLERANCE = 0.5;

/** Dossier des couronnes 375, relatif à la racine des assets. */
export const CROWN_FOLDER =
	'card-assets/v/bcdf4190b4bf/full-magic-pack/data/magic-modules.mse-include/crowns/375';

/**
 * Fichier de couronne par clé de couleur du studio.
 *
 * Mêmes clés que FRAME_FILE_STEMS, à une exception : `land` n'y figure PAS. Le
 * corpus ne fournit aucune couronne terrain, alors que les terrains légendaires
 * existent (Dark Depths, Urborg). Mieux vaut ne rien peindre que de pointer un
 * `lcrown.png` inexistant.
 */
const CROWN_FILE_BY_FRAME = {
	light: 'wcrown.png',
	tide: 'ucrown.png',
	void: 'bcrown.png',
	ember: 'rcrown.png',
	grove: 'gcrown.png',
	prismatic: 'mcrown.png',
	artifact: 'acrown.png',
};

/** Le gabarit accepte-t-il la couronne ? */
export function acceptsCrown(geometry) {
	if (!geometry) return false;
	if (geometry.cardWidth !== CROWN_CARD_WIDTH) return false;
	if (geometry.cardHeight !== CROWN_CARD_HEIGHT) return false;
	const name = geometry.boxes?.name;
	if (!name) return false;
	return ['left', 'top', 'width', 'height'].every(
		(key) => Math.abs(name[key] - CROWN_REFERENCE_NAME_BOX[key]) < BOX_TOLERANCE
	);
}

/**
 * Chemins des couronnes du gabarit, ou `null` s'il n'en accepte pas.
 *
 * `null` et non `{}` : la colonne distingue « incompatible » de « compatible
 * mais sans asset », et le rendu n'a qu'un test à faire.
 */
export function buildCrownPaths(geometry) {
	if (!acceptsCrown(geometry)) return null;
	return Object.fromEntries(
		Object.entries(CROWN_FILE_BY_FRAME).map(([frame, file]) => [frame, `${CROWN_FOLDER}/${file}`])
	);
}
