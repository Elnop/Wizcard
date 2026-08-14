// scripts/card-assets/crown-compat.mjs
//
// Décide quels gabarits acceptent la couronne légendaire, et construit leurs
// chemins d'assets.
//
// Module pur : aucun accès filesystem ou réseau. Importé aussi bien par
// upload-templates.ts (production) que par seed-local-crowns.mjs (base
// locale, jetable) — ce dernier ne doit jamais déclencher d'écriture avant
// d'en décider lui-même.
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

import { ASSET_VERSION } from './asset-version.mjs';

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

/**
 * Dossier des couronnes 375, relatif à la racine des assets.
 *
 * Dérivé de la même ASSET_VERSION que generate-manifests.mjs (cf.
 * asset-version.mjs) : bumper le pack déplace frame_paths ET crown_paths
 * ensemble, aucun des deux ne peut rester pointé sur un dossier retiré.
 */
export const CROWN_FOLDER = `card-assets/v/${ASSET_VERSION}/full-magic-pack/data/magic-modules.mse-include/crowns/375`;

/**
 * Fichier de couronne par clé de couleur du studio.
 *
 * Seulement les 7 clés de couleur de base : aucune des clés `land-*` (une par
 * couleur, plus `land-colorless`) ni `colorless` n'y figure. Le corpus ne
 * fournit aucune couronne terrain ni incolore, alors que les terrains
 * légendaires existent (Dark Depths, Urborg). L'appelant doit ramener ces
 * clés à leur couleur de base avant le lookup (cf. resolveMseCrownPath côté
 * client) ; mieux vaut ne rien peindre — ou peindre la couronne de la couleur
 * de base — que de pointer un fichier inexistant.
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

/**
 * Tous les chemins de couronnes, indépendamment de tout gabarit.
 *
 * Les 7 fichiers vivent dans un dossier de module MSE partagé
 * (magic-modules.mse-include/crowns/375), pas sous le dossier d'un gabarit
 * précis : aucun `template.framePaths` ne les référence jamais. Dérivé de la
 * MÊME table que buildCrownPaths, donc les deux ne peuvent pas diverger.
 * upload-templates.ts doit ajouter cette liste à l'ensemble uploadé de façon
 * inconditionnelle (pas par gabarit), sans quoi les couronnes ne sont jamais
 * téléversées alors que crown_paths pointe déjà dessus.
 */
export const ALL_CROWN_PATHS = Object.values(CROWN_FILE_BY_FRAME).map(
	(file) => `${CROWN_FOLDER}/${file}`
);

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
