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
	// A Jumpstart pack is a fixed 20-card half-deck: two are shuffled together
	// to make a 40-card game deck. Duplicates are expected (a pack can carry
	// several copies of a card) and there is no sideboard.
	jumpstart: {
		minMainboard: 20,
		maxMainboard: 20,
		maxCopies: null,
		maxSideboard: null,
		singleton: false,
		requiresCommander: false,
		commanderCount: 0,
		allowedZones: ['mainboard', 'maybeboard'],
	},
	// Planechase and Archenemy are casual variants played WITH an ordinary
	// constructed deck, alongside a separate oversized-card deck (planes /
	// schemes) that this app does not model. Fall back to constructed rules
	// rather than invent constraints.
	planechase: { ...CONSTRUCTED_RULES },
	archenemy: { ...CONSTRUCTED_RULES },
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

export function isBasicLand(card: { name: string }): boolean {
	return BASIC_LAND_NAMES.has(card.name);
}

export type ValidationWarning = {
	type: 'size' | 'copies' | 'legality' | 'commander' | 'color-identity' | 'rarity';
	message: string;
};

const PARTNER_WITH_PREFIX = 'Partner with';
const FRIENDS_FOREVER = 'Friends forever';
const DOCTORS_COMPANION = "Doctor's companion";

const Ability = {
	partner: 'partner',
	partnerWith: 'partner-with',
	friendsForever: 'friends-forever',
	doctorsCompanion: 'doctors-companion',
	background: 'background',
} as const;

type PartnerAbility = (typeof Ability)[keyof typeof Ability];

// Returns the generic partner keyword name for a card, or null if none.
// "Partner" = generic (pairs with any other Partner card)
// "Partner with X" = named partner (only pairs with the specific card X)
// "Friends forever" = Un-set mechanic, pairs with any other Friends forever card
// "Doctor's companion" = pairs with a Doctor commander
function getPartnerAbility(card: ScryfallCard): PartnerAbility | null {
	const keywords = card.keywords ?? [];
	const oracleText = card.oracle_text ?? '';
	const typeLine = card.type_line ?? '';

	if (keywords.some((k) => k === 'Partner') || /\bPartner\b(?! with)/.test(oracleText)) {
		return Ability.partner;
	}
	if (
		keywords.some((k) => k.startsWith(PARTNER_WITH_PREFIX)) ||
		/\bPartner with\b/.test(oracleText)
	) {
		return Ability.partnerWith;
	}
	if (keywords.some((k) => k === FRIENDS_FOREVER) || /\bFriends forever\b/i.test(oracleText)) {
		return Ability.friendsForever;
	}
	if (keywords.some((k) => k === DOCTORS_COMPANION) || /\bDoctor's companion\b/i.test(oracleText)) {
		return Ability.doctorsCompanion;
	}
	// Background enchantments can be paired with a legendary commander
	if (/\bBackground\b/.test(typeLine) && /\bEnchantment\b/.test(typeLine)) {
		return Ability.background;
	}
	return null;
}

// Returns the name this card partners with (for "Partner with X"), or null.
function getNamedPartner(card: ScryfallCard): string | null {
	const match =
		(card.oracle_text ?? '').match(/Partner with ([^\n(]+)/) ??
		(card.keywords ?? [])
			.find((k) => k.startsWith(PARTNER_WITH_PREFIX))
			?.replace(`${PARTNER_WITH_PREFIX} `, '')
			.trim();
	if (Array.isArray(match)) return match[1]?.trim() ?? null;
	return typeof match === 'string' ? match : null;
}

function isDoctor(card: ScryfallCard): boolean {
	return /\bDoctor\b/.test(card.type_line ?? '');
}

// Returns true if the two named-partner cards reference each other by name.
function isMatchedNamedPartner(a: ScryfallCard, b: ScryfallCard): boolean {
	const namedByA = getNamedPartner(a);
	const namedByB = getNamedPartner(b);
	return Boolean(namedByA && namedByB && namedByA === b.name && namedByB === a.name);
}

// Returns true if two commander-zone cards form a legal pair.
function isLegalCommanderPair(a: ScryfallCard, b: ScryfallCard): boolean {
	const abilityA = getPartnerAbility(a);
	const abilityB = getPartnerAbility(b);

	// Generic Partner + Generic Partner
	if (abilityA === Ability.partner && abilityB === Ability.partner) return true;

	// Partner with X + the correct named partner
	if (abilityA === Ability.partnerWith && abilityB === Ability.partnerWith) {
		return isMatchedNamedPartner(a, b);
	}

	// Friends forever + Friends forever
	if (abilityA === Ability.friendsForever && abilityB === Ability.friendsForever) return true;

	// Doctor's companion: one must be a Doctor, the other must have "Doctor's companion"
	if (abilityA === Ability.doctorsCompanion && isDoctor(b)) return true;
	if (abilityB === Ability.doctorsCompanion && isDoctor(a)) return true;

	// Background: one is a legendary non-Background commander, the other is a Background enchantment
	if (abilityA === Ability.background && abilityB !== Ability.background) return true;
	if (abilityB === Ability.background && abilityA !== Ability.background) return true;

	return false;
}

// Returns the maximum allowed commanders for this combination of commander-zone cards.
// Handles all multi-commander exceptions.
function getEffectiveCommanderMax(
	rules: FormatRules,
	commanderCards: Array<{ card: ScryfallCard }>
): number {
	if (rules.commanderCount !== 1 || commanderCards.length <= 1) return rules.commanderCount;

	if (commanderCards.length === 2) {
		const [a, b] = commanderCards.map((c) => c.card);
		if (isLegalCommanderPair(a, b)) return 2;
	}

	return rules.commanderCount;
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
	commanderCards: Array<{ card: ScryfallCard }>,
	effectiveCommanderMax: number
): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	if (!rules.requiresCommander) return warnings;
	if (commanderCards.length === 0) {
		warnings.push({ type: 'commander', message: 'A commander is required for this format' });
	}
	if (commanderCards.length > effectiveCommanderMax) {
		if (commanderCards.length === 2 && rules.commanderCount === 1) {
			warnings.push({
				type: 'commander',
				message:
					'Two commanders are only allowed when both have Partner, Friends forever, a named Partner with each other, or one is a Background enchantment / Doctor’s companion paired with a compatible commander',
			});
		} else {
			warnings.push({
				type: 'commander',
				message: `Too many commanders: ${commanderCards.length} (max ${effectiveCommanderMax})`,
			});
		}
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
	// Scryfall publishes no legality field for these: draft/limited are sealed
	// formats, and jumpstart/planechase/archenemy are product lines or casual
	// variants with no maintained banlist. Skip the check rather than warn on
	// every card for a format nobody adjudicates. Written as a narrowing union
	// so `legalityKey` is provably a key of ScryfallLegalities below.
	type UnadjudicatedFormat = 'draft' | 'limited' | 'jumpstart' | 'planechase' | 'archenemy';
	const isUnadjudicated = (f: DeckFormat): f is UnadjudicatedFormat =>
		f === 'draft' ||
		f === 'limited' ||
		f === 'jumpstart' ||
		f === 'planechase' ||
		f === 'archenemy';
	if (isUnadjudicated(format)) return [];
	const legalityKey = format;
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

	const effectiveCommanderMax = getEffectiveCommanderMax(rules, commanderCards);

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
