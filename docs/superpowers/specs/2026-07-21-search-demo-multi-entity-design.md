# SearchDemo multi-entity rework

## Problem

The landing "Search" section (`PinnedFeature` index 1) claims a **multi-entity** search:

- title: _"One bar for cards, decks and players"_
- description: _"Instant multi-entity search with advanced Scryfall filters…"_

But its animation (`SearchDemo`) only types `"Lightning Bolt"` and fans in **three card
images**. It represents card search alone. The real `/search` page indexes three entity
types, each with a distinct result component and a tab switcher:

| Entity   | Real component  | Result look                                                                |
| -------- | --------------- | -------------------------------------------------------------------------- |
| Cards    | card image grid | Scryfall card images                                                       |
| Decks    | `DeckCard`      | cover art-crop + name + format pill + color pips (+ mana curve/commander)  |
| Profiles | `ProfileCard`   | MTG 63/88 frame: nickname title bar, avatar/ghost art, type line, PT badge |

Tabs are the real `SearchEntitySwitcher` (`Cards · Decks · Profiles`).

The animation must represent the same components (animated mocks), so the demo matches
what the section promises and what `/search` actually is.

## Goal

Rewrite `SearchDemo` so, driven by scroll `progress` (0→1), it walks through the three
real search entities inside one frame — a persistent search bar + tab bar, with the
active tab and its results morphing Cards → Decks → Profiles. Mocks visually echo the
real `DeckCard` / `ProfileCard` components.

## Non-goals

- No runtime fetch. The landing renders deterministically and offline; all data stays
  static in `demoContent.ts` (existing constraint).
- No new dependencies.
- Not a pixel-perfect clone of `DeckCard`/`ProfileCard` — a faithful **mini** version
  sized for the demo frame. We do not import those components (they pull `next-intl`,
  dnd-kit, tilt handlers, links — inappropriate for a static showcase).
- No change to the section copy (already correct) or to `/search` itself.

## Layout

One frame (`~min(70vh,520px)` tall, ~half-column wide), composed top→bottom:

```
┌───────────────────────────────┐
│  ⌕  <query being typed>     |  │  search bar (persistent)
│  [Cards]  Decks   Profiles     │  tab bar (persistent, active slides)
│                                │
│   <entity results morph here>  │  results zone (fixed height, centered)
│                                │
└───────────────────────────────┘
```

- **Search bar**: same styled bar as today (gold-tinted border, `⌕` glyph, blinking
  caret). The query text is beat-dependent (see Beats).
- **Tab bar**: three labels `Cards · Decks · Profiles` mirroring `SearchEntitySwitcher`.
  Active tab is highlighted (pill/underline). The active indicator animates between tabs
  as beats change.
- **Results zone**: fixed height so results stay centered (as today's `.results`). Only
  one entity's results are visible at a time (matches the real app: one tab at a time).

## Beats (timing via `seg()`)

`progress` is split into three beats. Within each beat, the query "retypes" and that
entity's results rise in (`translateY + opacity`), reusing the existing staggered motion
(`local = clamp(cardsIn*3 - i)`). On beat change, the previous results fall/fade out and
the tab indicator slides.

| Range       | Tab      | Query            | Results                                                  |
| ----------- | -------- | ---------------- | -------------------------------------------------------- |
| 0.00 – 0.36 | Cards    | `Lightning Bolt` | 3 card images (`SEARCH_CARDS`), first gets the hero-lift |
| 0.36 – 0.68 | Decks    | `Gruul aggro`    | 2 mock DeckCards (`SEARCH_DECKS`)                        |
| 0.68 – 1.00 | Profiles | `@nickname`      | 2 mock ProfileCards (`SEARCH_PROFILES`)                  |

Query-morph: when a beat begins, the bar text types out that beat's query from empty
(each beat has its own `typed = seg(progress, beatStart, beatStart+0.1)` sub-range and
`slice`).

A single derived `activeTab: 0|1|2` from `progress` drives the tab highlight and which
results render, so tab + query + results never desync.

## Mock components (in `SearchDemo.tsx`)

### Mini DeckCard

A compact card: cover art-crop image, dark scrim, deck name overlaid, a format pill, and
color pips (small round WUBRG dots). Echoes `DeckCard`'s cover-forward look. Uses
`art_crop` Scryfall URLs (derived from existing verified IDs) through `scryfallImageLoader`.

### Mini ProfileCard

The real 63/88 frame reproduced minimally: title bar (nickname), art window
(avatar image OR ghost silhouette SVG — reuse the `GhostAvatar` path shape), a type line
(`Planeswalker — Player`), and the `🗎 deckCount / 🃏 cardCount` PT-style badge. Styling
mirrors `ProfileCard.module.css` (dark frame, gradients, hairline rules) but self-contained.

## Data (`demoContent.ts` additions)

```ts
export interface DemoDeckResult {
	name: string;
	format: string; // e.g. "Commander", "Modern"
	artCropSrc: string; // cards.scryfall.io /art_crop/... (verified IDs)
	colors: string[]; // WUBRG letters for pips
}
export const SEARCH_DECKS: DemoDeckResult[]; // 2 entries (e.g. Gruul aggro, mono-R burn)

export interface DemoProfileResult {
	nickname: string;
	avatarSrc?: string; // omitted → ghost silhouette
	deckCount: number;
	cardCount: number;
}
export const SEARCH_PROFILES: DemoProfileResult[]; // 2 entries, at least one ghost
```

Art-crop URLs are the `/art_crop/front/<a>/<b>/<id>.jpg` variants of IDs already verified
in `demoContent.ts`, so no new verification is needed. Avatars: use ghost fallbacks
(no real user avatars to embed), demonstrating the ghost state which is common in-app.

## i18n

`SearchDemo` currently takes no translations. Following the existing `ImportDemo` /
`PdfDemo` pattern (labels passed as props from `FeatureSections`), pass in:

- tab labels: `search.entityCards`, `search.entityDecks`, `search.entityProfiles`
- profile type line: `search.profileTypeLine`

These keys already exist (`messages/en.json`, `fr.json`). `FeatureSections` already
holds `useTranslations('landing')`; it will additionally read the `search` namespace (or
receive them via a small `labels` prop object) and forward to `SearchDemo`. Deck format
names and query strings (`Gruul aggro`, `Lightning Bolt`, nicknames) are proper
nouns/data and stay literal in `demoContent.ts` (consistent with other demos, e.g.
`IMPORT_SOURCES`).

## Static / reduced-motion state

`PinnedFeature` forces `progress = 1` when reduced-motion or mobile. Natural end-of-anim
is the Profiles beat. Instead, the static render rests on the **Cards beat** (tab Cards
active, 3 cards shown) — the most iconic/legible state, and the Decks/Profiles tabs
remain visible to signal multi-entity. Implemented by mapping the static case to the
Cards beat rather than `progress=1`'s profiles beat (e.g. an `isStatic`/`static` prop or
detecting the forced end-state). The frame must clearly read as the `/search` page.

## Files touched

- `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx` — rewrite.
- `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.module.css` — rewrite
  (tab bar, mini deck card, mini profile card, results morph).
- `src/app/[locale]/(landing)/data/demoContent.ts` — add `SEARCH_DECKS`, `SEARCH_PROFILES`
  and their types.
- `src/app/[locale]/(landing)/components/FeatureSections.tsx` — forward search labels to
  `SearchDemo`.

## Verification

No test framework (project convention). Verify via:

- `npm run check` — gate on **no new** problems on the touched files (baseline is red;
  use `npx eslint` on changed files).
- `npm run build` — catches TS depth / import issues.
- Runtime: `npm run dev`, scroll the landing Search section; confirm the three beats,
  tab morph, and that reduced-motion/mobile shows the static Cards state. Confirm
  art-crop and card images load through `scryfallImageLoader`.

```

```
