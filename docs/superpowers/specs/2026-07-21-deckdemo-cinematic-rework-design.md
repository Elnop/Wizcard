# DeckDemo cinematic rework — design

Date: 2026-07-21
Section: landing page, feature #3 "Deckbuilding" (`(landing)/components/demos/DeckDemo`)

## Problem

The current DeckDemo plays stats-first: mana-curve bars grow (0.3–0.6), then a
color ring sweeps (0.5–0.75), then the opening hand fans in last (0.75–1). Two
issues:

1. **Order is backwards vs. the copy.** The section title is _"Construisez un
   deck, puis regardez-le sous le capot"_ — build first, analyse second. Cards
   should lead, stats should resolve from them.
2. **Stats are decorative, not real.** `MANA_CURVE` and `COLOR_SLICES` are
   hand-authored constants unrelated to the cards shown. Nothing connects the
   hand to the chart.

## Goal

Rework the animation so the **cards deal in first**, then the **stats resolve
out of them** (cause → effect), and every stat is **computed from the actual
card list** so the cards genuinely relate to the numbers.

## Card list — single source of truth

New constant `DECK_SAMPLE` in `data/demoContent.ts`: ~8 Gruul (red-green) aggro
cards, each carrying real gameplay data plus the existing Scryfall image `src`.

Shape:

```ts
export interface DemoDeckCard extends DemoCard {
	cmc: number;
	colors: string[]; // WUBRG letters; [] = colorless
	type: 'Creature' | 'Instant' | 'Sorcery' | 'Artifact' | 'Land' | 'Enchantment';
}
```

Archetype: Gruul aggro → low curve, ~R-heavy/G two-color ring. Cards reuse
already-defined `DemoCard` consts where possible (Lightning Bolt, Goblin Guide,
Monastery Swiftspear, Llanowar Elves, Birds of Paradise) and add a few
higher-CMC Gruul staples so the curve has real spread (not all CMC-1). Exact
list and verified values finalized during implementation; values must be
correct MTG data.

## Derived stats

Pure helpers (in `data/demoContent.ts` or a small `utils/deckStats.ts`) compute
all three stat sets from `DECK_SAMPLE` at module load:

- **Mana curve**: array of counts indexed by CMC 0..6+ (bucket 6+).
- **Color slices**: count of colored pips / cards per color → percentages for
  the conic-gradient ring. Colorless contributes a grey slice.
- **Type distribution**: counts per `type`, used for the type chips.

No more hand-authored `MANA_CURVE` / `COLOR_SLICES` — they are removed (only
DeckDemo consumes them; verified). `HAND_CARDS` is likewise removed/replaced by
`DECK_SAMPLE`. `SEARCH_CARDS` and `COLLECTION_CARDS` stay untouched (shared by
other demos).

## Animation timeline (progress 0 → 1)

Reversed from today, with overlapping beats for fluidity (using existing `seg`):

- **0 → 0.45 — Deal in (hero beat).** Cards deal onto the table one by one into
  a fanned spread, staggered per-card, each easing from off-frame with a slight
  rotate + translate (a "dealt" feel).
- **0.40 → 0.70 — Curve grows.** Bars rise up from the card spread's baseline.
  Each bar tints toward the dominant color of the cards feeding that CMC column.
  Cards recede/dim slightly to hand focus to the stats.
- **0.60 → 0.85 — Ring fills.** Color-identity ring sweeps in (existing
  conic-gradient sweep), slices now derived.
- **0.80 → 1.0 — Type chips.** Small type-distribution chips fade in / count up
  (e.g. Creatures ×N · Instants ×N · Artifacts ×N).

Reduced-motion / mobile: `PinnedFeature` already forces `progress = 1`, so the
fully-resolved end state (cards + all stats) shows statically. No extra work.

## Layout

Cards occupy the frame center first; stats resolve into the same space — curve
bars anchored to the card spread baseline, ring + chips to the side. Fits the
existing ~520px `.demo` frame. `DeckDemo.module.css` reworked for deal-in card
transforms, bar/card composition, and chips.

## Files touched

- `data/demoContent.ts` — add `DemoDeckCard`, `DECK_SAMPLE`, derive helpers;
  remove `HAND_CARDS`, `MANA_CURVE`, `COLOR_SLICES`.
- `demos/DeckDemo/DeckDemo.tsx` — new reversed timeline + type chips.
- `demos/DeckDemo/DeckDemo.module.css` — deal-in styles, composition, chips.

## Out of scope

- No copy/translation changes (existing description already fits).
- No changes to other demos or shared constants.
- No new data fetching — landing stays deterministic/offline.

## Verification

- `npm run check` — no NEW problems on changed files (base is not green;
  gate via `npx eslint` on changed files).
- Runtime: dev server, scroll the Deckbuilding section — cards deal first,
  stats resolve after, bars/ring/chips match the card list; reduced-motion
  shows resolved end state.
