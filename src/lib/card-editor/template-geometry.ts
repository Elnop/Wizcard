import { toCardTextFont } from './fonts';
import type { MseTemplate } from './mse-assets';
import type { CardLayoutGeometry, CardRect } from './types';

/**
 * Convertit la géométrie mesurée (repère du style MSE, ex. 375x523) vers le
 * repère du canvas.
 *
 * Le canvas adopte le ratio NATIF du gabarit plutôt qu'un 744x1039 imposé :
 * 27 cadres du catalogue sont en paysage, et les forcer en portrait étirait
 * l'illustration comme les zones de texte.
 */
const CANVAS_LONG_EDGE = 1039;

/**
 * Pied de carte, déduit et non mesuré.
 *
 * Le corpus MSE éclate cette ligne en plusieurs champs (`illustrator`,
 * `copyright line`, `card number`…) qui ne font pas partie des zones extraites.
 * On la cale donc sur le BAS DE LA CARTE, comme le fait le gabarit `arcana`
 * dessiné à la main : son pied est à y=964 pour 1039 de haut, soit 75 px de
 * fond de carte. L'ancrer sous la zone de texte le collait au bord noir des
 * gabarits dont le texte descend bas (constaté sur `magic-tenth`).
 */
const FOOTER_BOTTOM_OFFSET = 75;
const FOOTER_HEIGHT = 28;

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
		// Ligne de bas de carte : calée sur le bas de la carte (cf.
		// FOOTER_BOTTOM_OFFSET), alignée horizontalement sur la zone de texte.
		// Reprendre `boxes.text` tel quel plaçait le pied SUR le haut du texte
		// de règles.
		footer: {
			x: boxes.text.left * scale,
			y: cardHeight * scale - FOOTER_BOTTOM_OFFSET,
			width: boxes.text.width * scale,
			height: FOOTER_HEIGHT,
		},
		// Polices mesurées, passées par la MÊME échelle que les boîtes : leurs
		// tailles sont déclarées dans le repère du style (6.93 à 32 selon le
		// gabarit), pas en pixels du canvas. Un champ dont la police n'est ni
		// déclarée ni servie reste absent — le canvas garde alors sa pile
		// générique, cf. « aucun fallback ».
		// La boîte et l'ancrage sont passés avec la police : c'est ici qu'on
		// connaît l'échelle, donc ici qu'on calcule la ligne de base. Le canvas
		// n'a plus qu'à peindre — il posait auparavant `boîte.y + 36`, une
		// constante calibrée sur M15 dont 125 des 136 cadres débordaient.
		fonts: {
			title: toCardTextFont(source.fonts?.name, scale, boxes.name, source.layout?.name),
			typeLine: toCardTextFont(source.fonts?.type, scale, boxes.type, source.layout?.type),
			rules: toCardTextFont(source.fonts?.text, scale, boxes.text, source.layout?.text),
			stats: toCardTextFont(source.fonts?.pt, scale, boxes.pt, source.layout?.pt),
		},
	};
}
