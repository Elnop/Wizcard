import type { CardRect } from './types';

/**
 * Marge de déplacement disponible pour l'illustration, par axe, en POURCENTAGE
 * de la boîte d'art — l'unité dans laquelle `offsetX`/`offsetY` sont stockés.
 *
 * Le déplacement était borné à ±50 % en dur, sans rapport avec l'image. Or la
 * marge utile dépend du DÉBORDEMENT de l'image hors de la boîte, donc de son
 * ratio et du zoom. Les deux erreurs que ça produisait :
 *
 * - Une image moins large que la boîte ne déborde pas horizontalement : sa marge
 *   en X est NULLE, et tout déplacement y faisait entrer du vide dans la carte.
 *   (Cas mesuré : image carrée 1200×1200 dans la boîte 316×231 du cadre M15 —
 *   0 % en X, ±18,4 % en Y, là où l'interface autorisait ±50 % dans les deux.)
 * - À l'inverse, une image très panoramique déborde de bien plus de 50 %, et ses
 *   bords restaient inatteignables.
 */
export interface ArtPanBounds {
	maxOffsetX: number;
	maxOffsetY: number;
}

/**
 * Marge retenue quand les dimensions de l'image sont inconnues : AUCUNE.
 *
 * Sans dimensions, le débordement est incalculable. Autoriser un déplacement
 * « au cas où » violerait l'invariant que ce module garantit — un décalage de
 * 2 % suffit à ouvrir du vide sur une image sans marge horizontale (constaté).
 * Zéro est le seul choix qui ne peut pas laisser de trou, et il est
 * temporaire : `measureArtwork` renseigne les dimensions dès le chargement de
 * l'image, y compris pour les brouillons enregistrés avant leur introduction.
 */
export const UNKNOWN_PAN_LIMIT = 0;

/**
 * Marge de déplacement pour une image peinte en `xMidYMid slice`.
 *
 * `slice` met l'image à l'échelle du PLUS GRAND rapport, de sorte qu'elle
 * couvre la boîte entièrement : c'est ce qui garantit qu'aucun vide n'apparaît,
 * et c'est aussi ce qui rogne l'image sur l'axe le plus long. La partie rognée
 * est exactement la marge dans laquelle on peut se déplacer.
 *
 * `zoom` multiplie cette échelle, donc agrandit la marge sur les deux axes.
 *
 * Dimensions d'image absentes ou aberrantes (brouillon sauvegardé avant que
 * l'import ne les enregistre, image de largeur nulle) : marge NULLE, cf.
 * `UNKNOWN_PAN_LIMIT`. On ne devine pas un ratio, et on n'autorise pas non plus
 * un déplacement qui pourrait ouvrir du vide.
 */
export function artPanBounds(
	rect: CardRect,
	imageWidth: number | undefined,
	imageHeight: number | undefined,
	zoom: number
): ArtPanBounds {
	const isMeasurable =
		typeof imageWidth === 'number' &&
		typeof imageHeight === 'number' &&
		imageWidth > 0 &&
		imageHeight > 0 &&
		rect.width > 0 &&
		rect.height > 0 &&
		zoom > 0;
	if (!isMeasurable) {
		return { maxOffsetX: UNKNOWN_PAN_LIMIT, maxOffsetY: UNKNOWN_PAN_LIMIT };
	}

	const scale = Math.max(rect.width / imageWidth, rect.height / imageHeight) * zoom;
	const paintedWidth = imageWidth * scale;
	const paintedHeight = imageHeight * scale;

	// Le débordement se répartit de part et d'autre : la moitié de chaque côté.
	// Exprimé en pourcentage de la boîte, puisque c'est l'unité des offsets.
	const overflowX = Math.max(0, paintedWidth - rect.width) / 2;
	const overflowY = Math.max(0, paintedHeight - rect.height) / 2;

	return {
		maxOffsetX: (overflowX / rect.width) * 100,
		maxOffsetY: (overflowY / rect.height) * 100,
	};
}

/** Ramène une valeur dans [-limit, limit]. `limit` nul fige l'axe sur 0. */
export function clampOffset(value: number, limit: number): number {
	return Math.max(-limit, Math.min(limit, value));
}

/**
 * Ramène un cadrage dans ses bornes. C'est LA garantie « pas de vide » :
 * l'illustration couvre toujours la boîte d'art, quel que soit le chemin par
 * lequel le cadrage a été modifié (glisser, curseurs, zoom, import).
 *
 * À appliquer sur toute écriture de cadrage plutôt que sur l'affichage seul :
 * borner au rendu masque le débordement sans le corriger, si bien que la valeur
 * ENREGISTRÉE reste fausse — elle repartirait telle quelle vers la sauvegarde,
 * l'export PNG et le rechargement.
 *
 * Le zoom est ramené à 1 au minimum : sous 1, l'image ne couvre plus la boîte et
 * aucun décalage ne peut rattraper le vide.
 *
 * Boîte d'art inconnue (catalogue pas encore chargé) : le décalage est ramené à
 * ZÉRO, pas laissé tel quel. Une boîte inconnue rend la marge incalculable, donc
 * tout décalage y est un pari — et `artPanBounds` fait déjà le même choix quand
 * ce sont les dimensions de l'image qui manquent. Le cadrage se rétablit dès que
 * la géométrie arrive, puisque toute écriture repasse ici.
 */
export function clampArtwork<T extends { zoom: number; offsetX: number; offsetY: number }>(
	artwork: T & { width?: number; height?: number },
	rect: CardRect | undefined
): T {
	const zoom = Math.max(1, artwork.zoom);
	if (!rect) return { ...artwork, zoom, offsetX: 0, offsetY: 0 };
	const bounds = artPanBounds(rect, artwork.width, artwork.height, zoom);
	return {
		...artwork,
		zoom,
		offsetX: clampOffset(artwork.offsetX, bounds.maxOffsetX),
		offsetY: clampOffset(artwork.offsetY, bounds.maxOffsetY),
	};
}
