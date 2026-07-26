import { getCardLayout } from './layout-registry';
import type { MseTemplate } from './mse-assets';
import type { CardLayoutGeometry, CardLayoutId, CardRect } from './types';

/**
 * Convertit la géométrie mesurée (repère du style MSE, ex. 375x523) vers le
 * repère du canvas.
 *
 * Le canvas adopte le ratio NATIF du gabarit plutôt qu'un 744x1039 imposé :
 * 27 cadres du catalogue sont en paysage, et les forcer en portrait étirait
 * l'illustration comme les zones de texte.
 */
const CANVAS_LONG_EDGE = 1039;

export type CardGeometry = CardLayoutGeometry;

export function templateGeometry(template: MseTemplate | undefined): CardGeometry | null {
	const source = template?.geometry;
	if (!source) return null;
	const { cardWidth, cardHeight, boxes } = source;
	if (!boxes.image || !boxes.name || !boxes.type || !boxes.text) return null;

	// Échelle uniforme sur le grand côté : les proportions du gabarit sont
	// préservées, ce qui est tout l'intérêt de lire ses dimensions déclarées.
	const scale = CANVAS_LONG_EDGE / Math.max(cardWidth, cardHeight);
	const to = (box: { left: number; top: number; width: number; height: number }): CardRect => ({
		x: box.left * scale,
		y: box.top * scale,
		width: box.width * scale,
		height: box.height * scale,
	});

	return {
		width: cardWidth * scale,
		height: cardHeight * scale,
		art: to(boxes.image),
		title: to(boxes.name),
		// Le coût de mana se pose SUR la ligne de titre : à défaut de zone mesurée
		// (12 gabarits), la boîte du nom est le bon repère, pas un emprunt fautif —
		// c'est là que le coût s'imprime sur une vraie carte. Contrairement à
		// `stats` ci-dessous, rien n'est peint ici : c'est une ancre, pas un panneau.
		mana: to(boxes['casting cost'] ?? boxes.name),
		typeLine: to(boxes.type),
		rules: to(boxes.text),
		// Pas de zone `pt` mesurée (48 gabarits) => boîte de LARGEUR NULLE, et non
		// celle de la ligne de type : `showStats` ne s'allume que sur une largeur
		// positive, donc le panneau force/endurance reste masqué au lieu d'être
		// peint par-dessus le type. Emprunter une autre zone serait un fallback.
		stats: boxes.pt ? to(boxes.pt) : { x: 0, y: 0, width: 0, height: 0 },
		footer: to(boxes.text),
	};
}

/** Repli explicite : les gabarits MAISON, qui ont leur géométrie dessinée à la main. */
export function houseGeometry(layoutId: CardLayoutId): CardGeometry {
	return getCardLayout(layoutId).geometry;
}
