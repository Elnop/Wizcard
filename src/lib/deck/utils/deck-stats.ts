import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import {
	parseColorPips,
	iterateFaces,
	categorizeType,
	type ManaColor,
	type BalanceKey,
	type TypeCategory,
} from './mana-cost';

export interface DeckStats {
	totalCards: number;
	mainboardCount: number;
	sideboardCount: number;
	maybeboardCount: number;
	commanderCount: number;
	landCount: number;
	averageCmc: number;
	manaCurve: Record<number, number>;
	colorDistribution: Record<string, number>; // color identity — inchangé
	colorsCost: Record<BalanceKey, number>; // pips requis (hybride 0.5, {C} inclus ; ANY toujours 0)
	colorsProduction: Record<BalanceKey, number>; // sources ({C} séparé, ANY = sources 5-couleurs)
	typeDistribution: Record<TypeCategory, number>;
}

const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

function emptyBalance(): Record<BalanceKey, number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ANY: 0 };
}

/**
 * Ajoute les sources de mana d'une carte au tableau de production.
 * Une source qui produit exactement les 5 couleurs (City of Brass, Command
 * Tower...) compte dans ANY, pas +1 sur chaque couleur (ça fausserait l'équilibre).
 */
function accumulateProduction(producedMana: readonly string[], into: Record<BalanceKey, number>) {
	const wubrgProduced = MANA_COLORS.filter((c) => producedMana.includes(c));
	if (wubrgProduced.length === 5) {
		into.ANY += 1;
	} else {
		for (const c of wubrgProduced) into[c] += 1;
	}
	if (producedMana.includes('C')) into.C += 1;
}
function emptyTypes(): Record<TypeCategory, number> {
	return {
		Creature: 0,
		Instant: 0,
		Sorcery: 0,
		Enchantment: 0,
		Artifact: 0,
		Planeswalker: 0,
		Land: 0,
		Other: 0,
	};
}

export function computeDeckStats(cards: Array<{ card: ScryfallCard; zone: DeckZone }>): DeckStats {
	const mainboard = cards.filter((c) => c.zone === 'mainboard');
	const sideboard = cards.filter((c) => c.zone === 'sideboard');
	const maybeboard = cards.filter((c) => c.zone === 'maybeboard');
	const commander = cards.filter((c) => c.zone === 'commander');

	const manaCurve: Record<number, number> = {};
	const colorsCost = emptyBalance();
	const colorsProduction = emptyBalance();
	const typeDistribution = emptyTypes();
	let cmcSum = 0;
	let cmcCount = 0;
	let landCount = 0;

	// Distributions par face : mainboard + commander, hors maybeboard/sideboard
	for (const { card } of [...mainboard, ...commander]) {
		// Production : au niveau carte (produced_mana absent des faces).
		accumulateProduction((card.produced_mana ?? []) as string[], colorsProduction);

		for (const face of iterateFaces(card)) {
			const category = categorizeType(face.type_line ?? '');
			typeDistribution[category] += 1;

			if (category === 'Land') {
				landCount++;
				continue; // exclu de la curve, du cmc moyen et des pips
			}

			const cmc = Math.floor(face.cmc ?? 0);
			manaCurve[cmc] = (manaCurve[cmc] ?? 0) + 1;
			cmcSum += cmc;
			cmcCount++;

			const pips = parseColorPips(face.mana_cost ?? '');
			for (const c of MANA_COLORS) colorsCost[c] += pips[c];
			colorsCost.C += pips.C;
		}
	}

	// Color identity (inchangé) : toutes zones sauf maybeboard
	const colorDistribution: Record<string, number> = {};
	for (const { card, zone } of cards) {
		if (zone === 'maybeboard') continue;
		for (const color of card.color_identity ?? []) {
			colorDistribution[color] = (colorDistribution[color] ?? 0) + 1;
		}
	}

	return {
		totalCards: mainboard.length + sideboard.length + commander.length,
		mainboardCount: mainboard.length,
		sideboardCount: sideboard.length,
		maybeboardCount: maybeboard.length,
		commanderCount: commander.length,
		landCount,
		averageCmc: cmcCount > 0 ? cmcSum / cmcCount : 0,
		manaCurve,
		colorDistribution,
		colorsCost,
		colorsProduction,
		typeDistribution,
	};
}
