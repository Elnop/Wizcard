import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';

export interface DeckStats {
	totalCards: number;
	mainboardCount: number;
	sideboardCount: number;
	maybeboardCount: number;
	commanderCount: number;
	averageCmc: number;
	manaCurve: Record<number, number>;
	colorDistribution: Record<string, number>;
}

export function computeDeckStats(cards: Array<{ card: ScryfallCard; zone: DeckZone }>): DeckStats {
	const mainboard = cards.filter((c) => c.zone === 'mainboard');
	const sideboard = cards.filter((c) => c.zone === 'sideboard');
	const maybeboard = cards.filter((c) => c.zone === 'maybeboard');
	const commander = cards.filter((c) => c.zone === 'commander');

	// Mana curve (mainboard + commander only, exclude lands)
	const manaCurve: Record<number, number> = {};
	let cmcSum = 0;
	let cmcCount = 0;
	for (const { card } of [...mainboard, ...commander]) {
		const typeLine = card.type_line ?? '';
		if (typeLine.toLowerCase().includes('land')) continue;
		const cmc = Math.floor(card.cmc ?? 0);
		manaCurve[cmc] = (manaCurve[cmc] ?? 0) + 1;
		cmcSum += cmc;
		cmcCount++;
	}

	// Color distribution (from color_identity of all non-maybeboard cards)
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
		averageCmc: cmcCount > 0 ? cmcSum / cmcCount : 0,
		manaCurve,
		colorDistribution,
	};
}
