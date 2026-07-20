// MTGJSON deck `type` → our DeckFormat. decks.format is constrained by
// decks_format_check to exactly: standard, modern, pioneer, legacy, vintage,
// commander, pauper, draft, limited, oathbreaker, brawl. Anything outside
// that set maps to null, which is a legal decks.format value — unmapped
// precons are still imported, they just show no format label. A wrong
// format label is worse than no label, so ambiguous types prefer null.
//
// This table was built from the live MTGJSON DeckList.json (2988 decks / 48
// distinct types, queried 2026-07-19 — one more than the 47 originally
// enumerated: "Arena Promotional Deck" (4 decks) was also observed).
// Rationale by group:
//
// Commander-shaped → 'commander':
//   Commander Deck, MTGO Commander Deck. (Handled primarily by the
//   "contains Commander" substring fallback below, listed here too for
//   clarity/coverage of exact matches.)
//
// Brawl-shaped → 'brawl':
//   Brawl Deck, Historic Brawl Precon Deck. (Also covered by the "contains
//   Brawl" substring fallback.)
//
// Products of Standard-legal precon lines (era-appropriate constructed
// product built around a then-current Standard environment) → 'standard':
//   Theme Deck, Intro Pack, Planeswalker Deck, Challenger Deck,
//   Starter Deck, Event Deck, Welcome Deck, Game Night Deck,
//   Modern Event Deck (despite the name, this is the 2015 "Modern Event
//   Deck" Standard-era product, not a Modern-format staple — MTGJSON's own
//   naming is misleading here, but the cards are Standard-legal singleton
//   precons of their time), Clash Pack, Starter Kit, Arena Starter Deck,
//   Arena Starter Kit, Spellslinger Starter Kit,
//   Enhanced Deck (a Kaldheim/VOW-era Standard variant), Halfdeck.
//
// Pioneer:
//   Pioneer Challenger Deck → 'pioneer' (explicitly named).
//
// Eternal/legacy-format-adjacent older constructed products → 'legacy':
//   Duel Deck, MTGO Duel Deck, Duel Of The Planeswalkers Deck,
//   Premium Deck, World Championship Deck, Pro Tour Deck,
//   Advanced Deck, Advanced Pack, MTGO Theme Deck, Demo Deck,
//   Deck Builder's Toolkit. These are older/reprint-heavy products spanning
//   many blocks with no single Standard legality window; 'legacy' is the
//   closest available bucket (all their cards are Legacy-legal) rather than
//   forcing an incorrect narrower format.
//
// No equivalent game format — genuinely format-less products → null:
//   Secret Lair Drop (curated reprint bundle, not a constructed product),
//   Jumpstart (its own limited/sealed format, not in our constraint list),
//   MTGO Redemption (a paper-to-MTGO redemption certificate, not a deck),
//   Bundle Land Pack (basic lands only), Box Set (a boxed compilation, not
//   a single constructed archetype), Sample Deck (promotional preview, not
//   a real constructed deck), Shandalar Enemy Deck / Enemy Deck (video-game
//   flavored AI decks, no tabletop format), Guild Kit (limited/sealed
//   product), Welcome Booster (a booster-pack product, not a built deck),
//   San Diego Comic Con Promos / Arena Promotional Deck (promo card
//   bundles, not a constructed deck archetype), Archenemy Deck (its own
//   casual variant, not in our constraint list), Planechase Deck (its own
//   casual variant, not in our constraint list), Challenge Deck
//   (Vanguard-adjacent casual product), Dandan Deck (a joke/un-set style
//   deck with no format).
//
// Everything else observed on the live feed collapses into one of the
// buckets above via the exact-match table or the substring fallbacks.

import type { DeckFormat } from '../../src/types/decks';

const TYPE_TO_FORMAT: Record<string, DeckFormat> = {
	// Commander
	'Commander Deck': 'commander',
	'MTGO Commander Deck': 'commander',
	Commander: 'commander',

	// Brawl
	'Brawl Deck': 'brawl',
	'Historic Brawl Precon Deck': 'brawl',
	Brawl: 'brawl',

	// Oathbreaker / Draft (no live examples currently, kept for forward compat)
	'Oathbreaker Deck': 'oathbreaker',
	'Draft Set': 'draft',

	// Real formats added to decks_format_check in 20260720150000 — these were
	// previously forced to null purely because the constraint lacked them.
	Jumpstart: 'jumpstart',
	'Planechase Deck': 'planechase',
	'Archenemy Deck': 'archenemy',

	// Pioneer
	'Pioneer Challenger Deck': 'pioneer',

	// Standard-legal-era constructed products
	'Theme Deck': 'standard',
	'Intro Pack': 'standard',
	'Planeswalker Deck': 'standard',
	'Challenger Deck': 'standard',
	'Starter Deck': 'standard',
	'Event Deck': 'standard',
	'Welcome Deck': 'standard',
	'Game Night Deck': 'standard',
	'Modern Event Deck': 'standard',
	'Clash Pack': 'standard',
	'Starter Kit': 'standard',
	'Arena Starter Deck': 'standard',
	'Arena Starter Kit': 'standard',
	'Spellslinger Starter Kit': 'standard',
	'Enhanced Deck': 'standard',
	Halfdeck: 'standard',

	// Older / eternal-format-adjacent constructed products
	'Duel Deck': 'legacy',
	'MTGO Duel Deck': 'legacy',
	'Duel Of The Planeswalkers Deck': 'legacy',
	'Premium Deck': 'legacy',
	'World Championship Deck': 'legacy',
	'Pro Tour Deck': 'legacy',
	'Advanced Deck': 'legacy',
	'Advanced Pack': 'legacy',
	'MTGO Theme Deck': 'legacy',
	'Demo Deck': 'legacy',
	"Deck Builder's Toolkit": 'legacy',
};

/**
 * Map an MTGJSON deck type to a DeckFormat, or null when there is no
 * equivalent in decks_format_check (Secret Lair Drop, Jumpstart, MTGO
 * Redemption, Planechase, Archenemy, Guild Kit...). Matching is exact
 * first, then falls back to "contains Commander" / "contains Brawl"
 * heuristics since MTGJSON has introduced variants like
 * "Commander Deck (Display)" that would otherwise miss the exact table.
 */
export function mapDeckFormat(mtgjsonType: string): DeckFormat | null {
	const exact = TYPE_TO_FORMAT[mtgjsonType];
	if (exact) return exact;
	if (mtgjsonType.includes('Commander')) return 'commander';
	if (mtgjsonType.includes('Brawl')) return 'brawl';
	return null;
}
