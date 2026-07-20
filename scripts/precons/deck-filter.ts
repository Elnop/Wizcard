// Which MTGJSON entries are actual decks, and which are just product SKUs.
//
// MTGJSON's DeckList.json is a catalogue of PRODUCTS, not of playable decks.
// Roughly a third of it is card bundles with no decklist meaning: reprint
// drops, set redemptions, land packs, booster contents. Importing those filled
// the deck search with entries no player would recognise as a deck.
//
// The test applied below is "would a player call this a deck?", checked against
// each type's real card counts in the live feed rather than its name:
//
//   REJECTED
//     Secret Lair Drop (703)   5-30 cards — illustrated reprint bundles
//     MTGO Redemption (196)    383 cards  — a whole-set redemption, an inventory
//     Bundle Land Pack (89)    40 cards   — basic lands only
//     Box Set (52)             8 or 363   — Commander Collections, Collectors' Ed.
//     Welcome Booster (16)     10-11      — booster contents
//     SDCC Promos (7)          5-6        — promo card bundles
//     Dandan Deck (1)          80         — joke deck, no format
//     Enemy Deck (1)           0          — empty upstream
//
//   KEPT (real decks that merely lack a format in decks_format_check)
//     Shandalar Enemy Deck (55)  60-138 cards
//     Sample Deck (50)           30 cards
//     Guild Kit (10)             60 cards
//     Arena Promotional Deck (4) 60 cards
//     Challenge Deck (3)         60 cards
//     Beginner Box (20)          20 cards — Jumpstart half-decks, see format-map
//
// A blocklist, not an allowlist: MTGJSON adds new types over time, and a new
// PRODUCT type slipping in is a smaller problem than a new DECK type being
// silently dropped. Anything unrecognised is imported.

const REJECTED_TYPES = new Set([
	'Secret Lair Drop',
	'MTGO Redemption',
	'Bundle Land Pack',
	'Welcome Booster',
	'San Diego Comic Con Promos',
	'Dandan Deck',
	'Enemy Deck',
]);

/**
 * "Box Set" is mixed: it covers Commander Collections and Collectors' Edition
 * (not decks) AND the Beginner Box products, which are Jumpstart half-decks.
 * Reject the type except for those.
 */
function isKeptBoxSet(name: string): boolean {
	return /^Beginner Box\b/i.test(name);
}

/** True when this MTGJSON entry is a deck worth importing. */
export function isImportableDeck(type: string, name: string): boolean {
	if (type === 'Box Set') return isKeptBoxSet(name);
	return !REJECTED_TYPES.has(type);
}
