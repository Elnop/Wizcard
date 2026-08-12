import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

/**
 * Bandeau PEINT d'un champ de texte, mesuré dans l'image du cadre.
 *
 * Pourquoi cette mesure existe : la boîte que MSE déclare pour un champ n'est
 * PAS le bandeau qu'on voit. Elle est calée sur le bord porté par l'ancrage et
 * ne couvre pas le panneau entier. Mesuré sur `magic-m15` :
 *
 *   name : bandeau 26..53   (28 u) / boîte 30..53  (23 u, `alignment: bottom`)
 *   type : bandeau 295..319 (25 u) / boîte 296..316 (20 u, `alignment: top`)
 *
 * Poser le texte sur la boîte donne donc un rendu décalé — nom collé au bas de
 * son bandeau, ligne de type haute — alors que les cartes produites par MSE
 * lui-même ont ces deux textes visuellement CENTRÉS dans leur panneau. La boîte
 * déclarée sert à MSE de zone de FLUX (retour à la ligne, rétrécissement
 * `shrink-overflow`), pas de repère de centrage vertical : c'est l'erreur de
 * modèle que cette mesure corrige.
 *
 * La mesure est faite hors ligne et publiée avec la géométrie : le canvas n'a
 * pas à décoder une image pour placer une ligne de texte, et le coût est payé
 * une fois par gabarit au lieu d'une fois par rendu.
 */
export interface TextBar {
	/** Bord haut du panneau, en unités de style. */
	top: number;
	/** Bord bas du panneau (inclus), en unités de style. */
	bottom: number;
	/** Bord gauche du panneau, en unités de style. */
	left: number;
	/** Bord droit du panneau (inclus), en unités de style. */
	right: number;
}

/**
 * Seuil de luminance qui sépare le panneau de sa bordure.
 *
 * Les bandeaux du corpus sont des panneaux CLAIRS cernés d'un liseré sombre
 * (bordure de carte, ombre portée du panneau). Le seuil se lit donc sur la
 * luminance, et 120/255 tombe dans le creux entre les deux populations :
 * mesuré, un pixel de panneau est à 160-240 et un pixel de liseré à 0-100.
 * Aucun n'approche le seuil à moins de 20 points.
 */
const PANEL_LUMINANCE = 120;

/**
 * Colonne d'échantillonnage, en fraction de la largeur du champ.
 *
 * Le CENTRE, et non un bord : les panneaux du corpus ont des coins arrondis et
 * un liseré qui remonte sur les côtés, si bien qu'une sonde latérale rogne le
 * panneau d'une unité en haut comme en bas. Sonder à 20 % donnait ainsi un
 * bandeau de nom 25.5..52.5 là où il vaut 26..53, et un bandeau de type
 * 295..319 pour un vrai 295..320 — assez pour que le texte, pourtant centré
 * dans la mesure, paraisse haut d'un pixel sur la carte.
 *
 * L'encre du texte ne gêne pas : la mesure se fait sur l'image du CADRE NU,
 * avant tout rendu de texte. Le seul risque au centre serait un ornement peint
 * dans le cadre lui-même, absent des bandeaux mesurés.
 */
const SAMPLE_X_RATIO = 0.5;

/**
 * Marge de recherche autour de la boîte déclarée, en unités de style.
 *
 * Le bandeau déborde de sa boîte des deux côtés (jusqu'à 4 u observées sur
 * `name`) mais reste proche : chercher plus loin risquerait d'attraper le
 * panneau voisin (la boîte de règles commence 11 u sous la ligne de type sur
 * M15). 8 u couvre les débordements observés avec de la marge, sans atteindre
 * le panneau suivant.
 */
const SEARCH_MARGIN = 8;

interface DecodedImage {
	width: number;
	height: number;
	/** Luminance par pixel, indexée `y * width + x`. */
	luma: Uint8Array;
}

const imageCache = new Map<string, DecodedImage | null>();

/**
 * Décode une image de cadre en luminance.
 *
 * Via `sharp`, déjà dépendance du projet : il lit JPEG comme PNG, ce dont on a
 * besoin puisque le corpus mélange les deux (`ucard.jpg` sur M15, `.png`
 * ailleurs). `greyscale().raw()` fait la conversion dans sharp — un canal au
 * lieu de trois, pas de boucle JS sur ~200 000 pixels par gabarit.
 *
 * Une image illisible rend `null` : l'appelant ne publie alors pas de bandeau,
 * plutôt que d'en deviner un.
 */
async function decode(path: string): Promise<DecodedImage | null> {
	const cached = imageCache.get(path);
	if (cached !== undefined) return cached;
	let out: DecodedImage | null = null;
	try {
		const buffer = await readFile(path);
		const { data, info } = await sharp(buffer)
			.greyscale()
			.raw()
			.toBuffer({ resolveWithObject: true });
		out = { width: info.width, height: info.height, luma: new Uint8Array(data) };
	} catch {
		out = null;
	}
	imageCache.set(path, out);
	return out;
}

/**
 * Mesure le bandeau qui entoure `box` dans l'image `framePath`.
 *
 * Rend `undefined` si l'image est illisible ou si le sondage ne trouve pas de
 * panneau franc — même règle « aucun repli » que le reste du pipeline : sans
 * mesure, le canvas garde l'ancrage déclaré plutôt qu'un bandeau deviné.
 */
export async function measureTextBar(
	framePath: string,
	box: { top: number; left: number; width: number; height: number },
	cardWidth: number,
	cardHeight: number
): Promise<TextBar | undefined> {
	const image = await decode(framePath);
	if (!image) return undefined;
	const sx = image.width / cardWidth;
	const sy = image.height / cardHeight;
	const x = Math.round((box.left + box.width * SAMPLE_X_RATIO) * sx);
	if (x < 0 || x >= image.width) return undefined;

	const isPanel = (styleY: number): boolean => {
		const y = Math.round(styleY * sy);
		if (y < 0 || y >= image.height) return false;
		return image.luma[y * image.width + x] >= PANEL_LUMINANCE;
	};

	// Le milieu de la boîte déclarée est dans le panneau sur tous les cadres
	// mesurés : c'est le point de départ de l'expansion. S'il n'y est pas, le
	// champ ne repose pas sur un panneau clair (texte posé à même l'illustration,
	// cf. cadres promo) et on ne mesure rien.
	// ARRONDI : l'expansion progresse par pas de 1, donc les bornes héritent de la
	// partie fractionnaire du point de départ. Une boîte de hauteur impaire (le
	// nom M15 : top 30, height 23) donnait un milieu à 41.5 et donc un bandeau
	// 25.5..52.5 pour un panneau réellement peint de 26 à 53 — un demi-pixel de
	// décalage, suffisant pour que le texte centré paraisse haut.
	const middle = Math.round(box.top + box.height / 2);
	if (!isPanel(middle)) return undefined;

	const lowerLimit = box.top - SEARCH_MARGIN;
	const upperLimit = box.top + box.height + SEARCH_MARGIN;
	let top = middle;
	while (top - 1 >= lowerLimit && isPanel(top - 1)) top -= 1;
	let bottom = middle;
	while (bottom + 1 <= upperLimit && isPanel(bottom + 1)) bottom += 1;

	// Un panneau qui touche les DEUX bornes n'a pas été délimité : on a sondé une
	// zone uniformément claire (illustration, cadre blanc) au lieu d'un bandeau.
	// Refuser plutôt que publier une hauteur arbitraire.
	if (top <= lowerLimit && bottom >= upperLimit) return undefined;

	// Étendue HORIZONTALE, balayée sur la ligne médiane du bandeau qu'on vient de
	// délimiter. Elle sert à poser le symbole d'extension : MSE rétrécit la boîte
	// de la ligne de type pour lui réserver la place, donc le symbole tombe dans
	// le bandeau mais hors de la boîte, et seule la mesure du bandeau le situe.
	//
	// Le balayage part du milieu du bandeau (et non du milieu de la boîte) pour
	// rester sur une ligne de panneau nu, sans glyphe.
	const midRow = (top + bottom) / 2;
	const isPanelAt = (styleX: number): boolean => {
		const px = Math.round(styleX * sx);
		const py = Math.round(midRow * sy);
		if (px < 0 || px >= image.width || py < 0 || py >= image.height) return false;
		return image.luma[py * image.width + px] >= PANEL_LUMINANCE;
	};
	let left = box.left;
	while (left - 1 >= 0 && isPanelAt(left - 1)) left -= 1;
	let right = box.left + box.width;
	while (right + 1 < cardWidth && isPanelAt(right + 1)) right += 1;

	return { top, bottom, left, right };
}
