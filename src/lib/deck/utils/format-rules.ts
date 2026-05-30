import type { DeckFormat, DeckZone } from '@/types/decks';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export interface FormatRules {
	minMainboard: number;
	maxMainboard: number | null;
	maxCopies: number | null; // null = unlimited
	maxSideboard: number | null; // null = no sideboard
	singleton: boolean;
	requiresCommander: boolean;
	commanderCount: number;
	allowedZones: DeckZone[];
}

const CONSTRUCTED_RULES: FormatRules = {
	minMainboard: 60,
	maxMainboard: null,
	maxCopies: 4,
	maxSideboard: 15,
	singleton: false,
	requiresCommander: false,
	commanderCount: 0,
	allowedZones: ['mainboard', 'sideboard', 'maybeboard'],
};

const FORMAT_RULES: Record<DeckFormat, FormatRules> = {
	standard: { ...CONSTRUCTED_RULES },
	modern: { ...CONSTRUCTED_RULES },
	pioneer: { ...CONSTRUCTED_RULES },
	legacy: { ...CONSTRUCTED_RULES },
	vintage: { ...CONSTRUCTED_RULES },
	pauper: { ...CONSTRUCTED_RULES },
	commander: {
		minMainboard: 99,
		maxMainboard: 99,
		maxCopies: 1,
		maxSideboard: null,
		singleton: true,
		requiresCommander: true,
		commanderCount: 1,
		allowedZones: ['mainboard', 'maybeboard', 'commander'],
	},
	brawl: {
		minMainboard: 59,
		maxMainboard: 59,
		maxCopies: 1,
		maxSideboard: null,
		singleton: true,
		requiresCommander: true,
		commanderCount: 1,
		allowedZones: ['mainboard', 'maybeboard', 'commander'],
	},
	oathbreaker: {
		minMainboard: 58,
		maxMainboard: 58,
		maxCopies: 1,
		maxSideboard: null,
		singleton: true,
		requiresCommander: false,
		commanderCount: 0,
		allowedZones: ['mainboard', 'maybeboard', 'commander'],
	},
	draft: {
		minMainboard: 40,
		maxMainboard: null,
		maxCopies: null,
		maxSideboard: null,
		singleton: false,
		requiresCommander: false,
		commanderCount: 0,
		allowedZones: ['mainboard', 'sideboard', 'maybeboard'],
	},
	limited: {
		minMainboard: 40,
		maxMainboard: null,
		maxCopies: null,
		maxSideboard: null,
		singleton: false,
		requiresCommander: false,
		commanderCount: 0,
		allowedZones: ['mainboard', 'sideboard', 'maybeboard'],
	},
};

export function getFormatRules(format: DeckFormat): FormatRules {
	return FORMAT_RULES[format];
}

const BASIC_LAND_NAMES = new Set([
	'Plains',
	'Island',
	'Swamp',
	'Mountain',
	'Forest',
	'Wastes',
	'Snow-Covered Plains',
	'Snow-Covered Island',
	'Snow-Covered Swamp',
	'Snow-Covered Mountain',
	'Snow-Covered Forest',
]);

function isBasicLand(card: ScryfallCard): boolean {
	return BASIC_LAND_NAMES.has(card.name);
}

export type ValidationWarning = {
	type: 'size' | 'copies' | 'legality' | 'commander' | 'color-identity' | 'rarity';
	message: string;
};

function hasPartnerKeyword(card: ScryfallCard): boolean {
	return (
		!!card.keywords?.some((k) => k === 'Partner' || k.startsWith('Partner with')) ||
		/\bPartner\b/.test(card.oracle_text ?? '')
	);
}

function checkDeckSize(
	rules: FormatRules,
	mainboardCards: unknown[],
	commanderCards: unknown[],
	effectiveCommanderMax: number
): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	const totalCards = mainboardCards.length + commanderCards.length;
	const totalMin = rules.maxMainboard ? rules.minMainboard + rules.commanderCount : null;
	const totalMax = rules.maxMainboard ? rules.maxMainboard + effectiveCommanderMax : null;
	if (totalMin !== null && totalCards < totalMin) {
		warnings.push({
			type: 'size',
			message: `Deck has ${totalCards} cards, minimum is ${totalMin}`,
		});
	}
	if (totalMax !== null && totalCards > totalMax) {
		warnings.push({
			type: 'size',
			message: `Deck has ${totalCards} cards, maximum is ${totalMax}`,
		});
	}
	if (totalMin === null && mainboardCards.length < rules.minMainboard) {
		warnings.push({
			type: 'size',
			message: `Mainboard has ${mainboardCards.length} cards, minimum is ${rules.minMainboard}`,
		});
	}
	return warnings;
}

function checkSideboardSize(
	rules: FormatRules,
	format: DeckFormat,
	sideboardCards: unknown[]
): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	if (rules.maxSideboard !== null && sideboardCards.length > rules.maxSideboard) {
		warnings.push({
			type: 'size',
			message: `Sideboard has ${sideboardCards.length} cards, maximum is ${rules.maxSideboard}`,
		});
	}
	if (rules.maxSideboard === null && sideboardCards.length > 0) {
		warnings.push({ type: 'size', message: `${format} does not allow a sideboard` });
	}
	return warnings;
}

function checkCommanderCount(
	rules: FormatRules,
	commanderCards: unknown[],
	effectiveCommanderMax: number
): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	if (!rules.requiresCommander) return warnings;
	if (commanderCards.length === 0) {
		warnings.push({ type: 'commander', message: 'A commander is required for this format' });
	}
	if (commanderCards.length > effectiveCommanderMax) {
		warnings.push({
			type: 'commander',
			message: `Too many commanders: ${commanderCards.length} (max ${effectiveCommanderMax})`,
		});
	}
	return warnings;
}

function checkCopyLimits(
	rules: FormatRules,
	cards: Array<{ card: ScryfallCard; zone: DeckZone }>
): ValidationWarning[] {
	if (rules.maxCopies === null) return [];
	const warnings: ValidationWarning[] = [];
	const counts = new Map<string, number>();
	for (const { card, zone } of cards) {
		if (zone === 'maybeboard' || isBasicLand(card)) continue;
		counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
	}
	for (const [name, count] of counts) {
		if (count > rules.maxCopies) {
			warnings.push({
				type: 'copies',
				message: `${name} has ${count} copies, maximum is ${rules.maxCopies}`,
			});
		}
	}
	return warnings;
}

function checkLegality(
	format: DeckFormat,
	cards: Array<{ card: ScryfallCard; zone: DeckZone }>
): ValidationWarning[] {
	const legalityKey = format === 'draft' || format === 'limited' ? null : format;
	if (!legalityKey) return [];
	const warnings: ValidationWarning[] = [];
	for (const { card, zone } of cards) {
		if (zone === 'maybeboard') continue;
		const legality = card.legalities?.[legalityKey];
		if (legality && legality !== 'legal' && legality !== 'restricted') {
			warnings.push({
				type: 'legality',
				message: `${card.name} is not legal in ${format} (${legality})`,
			});
		}
	}
	return warnings;
}

function checkColorIdentity(
	rules: FormatRules,
	cards: Array<{ card: ScryfallCard; zone: DeckZone }>,
	commanderCards: Array<{ card: ScryfallCard; zone: DeckZone }>
): ValidationWarning[] {
	if (!rules.requiresCommander || commanderCards.length === 0) return [];
	const warnings: ValidationWarning[] = [];
	const commanderIdentity = new Set(
		commanderCards.flatMap(({ card }) => card.color_identity ?? [])
	);
	for (const { card, zone } of cards) {
		if (zone === 'maybeboard') continue;
		const offColor = (card.color_identity ?? []).find((c) => !commanderIdentity.has(c));
		if (offColor) {
			warnings.push({
				type: 'color-identity',
				message: `${card.name} has color identity outside commander's (${offColor})`,
			});
		}
	}
	return warnings;
}

function checkPauper(
	format: DeckFormat,
	cards: Array<{ card: ScryfallCard; zone: DeckZone }>
): ValidationWarning[] {
	if (format !== 'pauper') return [];
	return cards
		.filter(({ zone, card }) => zone !== 'maybeboard' && card.rarity && card.rarity !== 'common')
		.map(({ card }) => ({
			type: 'rarity' as const,
			message: `${card.name} is ${card.rarity}, only commons are allowed in Pauper`,
		}));
}

export function validateDeck(
	format: DeckFormat | null,
	cards: Array<{ card: ScryfallCard; zone: DeckZone }>,
	commanderCards: Array<{ card: ScryfallCard; zone: DeckZone }>
): ValidationWarning[] {
	if (!format) return [];

	const rules = getFormatRules(format);
	const mainboardCards = cards.filter((c) => c.zone === 'mainboard');
	const sideboardCards = cards.filter((c) => c.zone === 'sideboard');

	const allCommandersHavePartner =
		commanderCards.length > 0 && commanderCards.every(({ card }) => hasPartnerKeyword(card));
	const effectiveCommanderMax =
		rules.commanderCount === 1 && allCommandersHavePartner ? 2 : rules.commanderCount;

	return [
		...checkDeckSize(rules, mainboardCards, commanderCards, effectiveCommanderMax),
		...checkSideboardSize(rules, format, sideboardCards),
		...checkCommanderCount(rules, commanderCards, effectiveCommanderMax),
		...checkCopyLimits(rules, cards),
		...checkLegality(format, cards),
		...checkColorIdentity(rules, cards, commanderCards),
		...checkPauper(format, cards),
	];
}
