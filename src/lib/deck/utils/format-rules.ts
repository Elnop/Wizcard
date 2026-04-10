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

export function validateDeck(
	format: DeckFormat | null,
	cards: Array<{ card: ScryfallCard; zone: DeckZone }>,
	commanderCards: Array<{ card: ScryfallCard; zone: DeckZone }>
): ValidationWarning[] {
	if (!format) return [];

	const rules = getFormatRules(format);
	const warnings: ValidationWarning[] = [];

	// Count cards per zone
	const mainboardCards = cards.filter((c) => c.zone === 'mainboard');
	const sideboardCards = cards.filter((c) => c.zone === 'sideboard');

	// Mainboard size
	if (mainboardCards.length < rules.minMainboard) {
		warnings.push({
			type: 'size',
			message: `Mainboard has ${mainboardCards.length} cards, minimum is ${rules.minMainboard}`,
		});
	}
	if (rules.maxMainboard && mainboardCards.length > rules.maxMainboard) {
		warnings.push({
			type: 'size',
			message: `Mainboard has ${mainboardCards.length} cards, maximum is ${rules.maxMainboard}`,
		});
	}

	// Sideboard size
	if (rules.maxSideboard !== null && sideboardCards.length > rules.maxSideboard) {
		warnings.push({
			type: 'size',
			message: `Sideboard has ${sideboardCards.length} cards, maximum is ${rules.maxSideboard}`,
		});
	}
	if (rules.maxSideboard === null && sideboardCards.length > 0) {
		warnings.push({
			type: 'size',
			message: `${format} does not allow a sideboard`,
		});
	}

	// Commander requirement
	if (rules.requiresCommander && commanderCards.length === 0) {
		warnings.push({
			type: 'commander',
			message: 'A commander is required for this format',
		});
	}
	if (rules.requiresCommander && commanderCards.length > rules.commanderCount) {
		warnings.push({
			type: 'commander',
			message: `Too many commanders: ${commanderCards.length} (max ${rules.commanderCount})`,
		});
	}

	// Copy limits (check across mainboard + sideboard, exclude basic lands)
	if (rules.maxCopies !== null) {
		const nonMaybeCards = cards.filter((c) => c.zone !== 'maybeboard');
		const counts = new Map<string, number>();
		for (const { card } of nonMaybeCards) {
			if (isBasicLand(card)) continue;
			const name = card.name;
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
		for (const [name, count] of counts) {
			if (count > rules.maxCopies) {
				warnings.push({
					type: 'copies',
					message: `${name} has ${count} copies, maximum is ${rules.maxCopies}`,
				});
			}
		}
	}

	// Format legality
	const legalityKey = format === 'draft' || format === 'limited' ? null : format;
	if (legalityKey) {
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
	}

	// Commander color identity
	if (rules.requiresCommander && commanderCards.length > 0) {
		const commanderIdentity = new Set<string>();
		for (const { card } of commanderCards) {
			for (const color of card.color_identity ?? []) {
				commanderIdentity.add(color);
			}
		}
		for (const { card, zone } of cards) {
			if (zone === 'maybeboard') continue;
			for (const color of card.color_identity ?? []) {
				if (!commanderIdentity.has(color)) {
					warnings.push({
						type: 'color-identity',
						message: `${card.name} has color identity outside commander's (${color})`,
					});
					break;
				}
			}
		}
	}

	// Pauper: only commons
	if (format === 'pauper') {
		for (const { card, zone } of cards) {
			if (zone === 'maybeboard') continue;
			if (card.rarity && card.rarity !== 'common') {
				warnings.push({
					type: 'rarity',
					message: `${card.name} is ${card.rarity}, only commons are allowed in Pauper`,
				});
			}
		}
	}

	return warnings;
}
