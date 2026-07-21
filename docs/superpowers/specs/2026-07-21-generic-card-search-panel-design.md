# Generic Card Search Panel — Design

**Date:** 2026-07-21
**Status:** Approved for planning

## Goal

The deck detail page has a `CardSearchPanel` — a fixed right-side panel (480px, expandable
to fullscreen) that searches Scryfall and adds cards to the deck. Generalize it into a
**config-driven** panel and mount it on the **collection** and **wishlist** pages so users
can search and quickly add cards there too, using the same panel layout.

## Current state

`CardSearchPanel` lives at
`src/app/[locale]/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`. Its reusable
core (SearchBar + FilterModal + `useScryfallCardSearch` + `CardList` grid + token/card mode

- all-languages toggle) is generic. Everything else is deck-coupled:

* EDHREC recommendations tab (`showEdhrecTab`, requires commander)
* Format legality toggle (`showLegalToggle`, `legalOnly`) + commander color-identity narrowing
* Deck zone badges on each result (`DeckZoneBadges` via `useDeckCardIndex`)
* "In collection only" toggle (`inCollectionOnly`) overlaying collection results
* Left-click → deck selection flow / token add (`addCardToDeck`)
* Right-click → `SearchCardContextMenu` (adds to deck zones)

The collection and wishlist pages currently have **no inline search-to-add**; users go to
`/search` or import.

The search page (`src/app/[locale]/search/views/CardSearchView.tsx`) already implements the
exact interaction the user wants for collection/wishlist:

- Left-click → `openCardModal` (card details modal)
- Right-click → `buildSearchMenuItems` (`src/app/[locale]/search/searchCardMenu.ts`):
  View details / Open card page / Add to collection / Add to wishlist / Add to deck,
  with labels from `useCardMenuLabels()`.

## Decisions (from brainstorming)

1. **Single generic panel via config prop** — one `CardSearchPanel`, three call sites.
2. **Same fixed right-side panel** layout on collection/wishlist (toggle button opens it;
   expandable to fullscreen; mobile fullscreen — all existing CSS reused).
3. **Collection/wishlist add interaction:** left-click opens the **card details modal**;
   right-click opens the **search-page context menu** (`buildSearchMenuItems`).
4. **Hidden on collection/wishlist** (deck-only): EDHREC tab, format legality toggle, deck
   zone badges, "in collection only" toggle.
5. **Move** the panel out of `decks/[id]/components/` into `src/lib/search/components/`
   (it already depends on SearchBar/FilterModal there).

## Architecture

### Mode config (discriminated union)

The panel is driven by a `mode` prop. All deck coupling is derived from `mode.kind`.

```ts
type PanelMode =
	| {
			kind: 'deck';
			deckId: string;
			deckFormat?: DeckFormat | null;
			commanderColorIdentity?: ScryfallColor[];
			commanderName?: string | null;
			onCardClick: (card: ScryfallCard) => void; // deck selection flow
			onCollectionModeChange?: (inCollectionOnly: boolean) => void;
	  }
	| { kind: 'collection' }
	| { kind: 'wishlist' };
```

Feature flags derived in the panel:

| Flag                    | deck             | collection | wishlist |
| ----------------------- | ---------------- | ---------- | -------- |
| EDHREC tab              | ✓ (if commander) | ✗          | ✗        |
| Format legality toggle  | ✓                | ✗          | ✗        |
| Deck zone badges        | ✓                | ✗          | ✗        |
| "In collection only"    | ✓                | ✗          | ✗        |
| SearchBar + FilterModal | ✓                | ✓          | ✓        |
| All-languages toggle    | ✓                | ✓          | ✓        |
| Token/card mode switch  | ✓                | ✓          | ✓        |

> **Token mode note:** kept in all modes (a token IS a card you can own/wish). Confirm at
> implementation; if it complicates non-deck add, it can be deck-only. Default: keep.

### Injected seams

The generic panel keeps the scryfall search core and exposes two behavior seams resolved
from `mode`:

- **`onCardClick`** (left-click a result):
  - deck: `mode.onCardClick` (unchanged selection/token flow)
  - collection/wishlist: `openCardModal(card)` from `useCardModalContext`
- **`buildCardMenuItems`** (right-click):
  - deck: existing `SearchCardContextMenu` (zone add) — unchanged
  - collection/wishlist: `buildSearchMenuItems(...)` with `useCardMenuLabels()`, wired to
    the same handlers the search page uses (`openAddCard` → `addCards`/`addToWishlist`,
    `openAddToDeck`, `openCardModal`, `router.push('/card/:id')`).

`renderOverlay`:

- deck: current overlay incl. `DeckZoneBadges`
- collection/wishlist: `withCustomBadge` (as on the search page), no zone badges.

### File layout

Move + refactor:

```
src/lib/search/components/CardSearchPanel/
  CardSearchPanel.tsx          # generic, mode-driven (moved + refactored)
  CardSearchPanel.module.css   # moved unchanged
  CardModeSwitcher.{tsx,css}   # moved
  PanelTabs.{tsx,css}          # moved (deck-only usage, still lives here)
  EdhrecRecommendations.tsx    # moved (rendered only in deck mode)
  DeckZoneBadges.{tsx,css}     # moved (rendered only in deck mode)
  SearchCardContextMenu.tsx    # moved (deck mode)
  useDeckCardIndex.ts          # moved (called only in deck mode)
  deck-card-index.ts, zone-badge.ts  # moved
```

Thin per-page wrappers (assemble mode + handlers, keep pages clean):

```
src/app/[locale]/collection/lib/CollectionSearchPanel.tsx
src/app/[locale]/wishlist/WishlistSearchPanel.tsx
```

Each wrapper: pulls the relevant contexts/providers (`useCollectionContext` /
`useWishlistContext`, `useCardModalContext`, `useAddCard`/`AddCardModalProvider`,
`useAddToDeckModal`, `useCardMenuLabels`), builds the collection/wishlist `buildCardMenuItems`

- `onCardClick`, and renders `<CardSearchPanel mode={{ kind: 'collection' }} ... />` with the
  open/expand/close props.

> Deck-mode hooks (`useDeckCardIndex`, `useDeckContext`) must only run when
> `mode.kind === 'deck'`. Because hooks can't be conditional, isolate deck-only hook usage
> into a `<DeckModeExtras>` subcomponent (or an internal `DeckCardSearchPanel` branch) that
> the generic panel renders only in deck mode — so collection/wishlist never mount
> `DeckProvider`-dependent hooks. This is the main refactor risk; plan must handle it
> explicitly.

### Page integration

For **collection** (`page.tsx`) and **wishlist** (`page.tsx`):

1. Add panel state: `searchPanelOpen`, `searchPanelExpanded`.
2. Add an **"Add cards"** button to the page `actions` area that toggles `searchPanelOpen`.
3. Render `<CollectionSearchPanel />` / `<WishlistSearchPanel />` when open, passing
   `expanded`, `onToggleExpand`, `onClose`.
4. Add a `layoutWithPanel`-style reflow: since the panel is `position: fixed`, apply
   `padding-right: calc(480px + gutter)` to the page content when the panel is open and not
   expanded (mirror `decks/[id]/page.module.css:92`; drop the reflow on mobile as the deck
   page does). Reuse `CardSearchPanel.module.css` for the panel itself.

The deck view (`DeckDetailOwnerView.tsx`) updates its call to the new import path and passes
`mode={{ kind: 'deck', deckId, deckFormat, commanderColorIdentity, commanderName,
onCardClick: setPanelSelectedCard, onCollectionModeChange: setPanelInCollectionOnly }}`.
Its existing panel state/props (`searchPanelOpen`, `searchPanelExpanded`,
`layoutWithPanel`) are unchanged.

## Non-goals

- No change to how cards are added (reuse existing `addCards` / `addToWishlist` /
  `openAddCard` / `openAddToDeck`).
- No quantity/print picker beyond what `openAddCard` already provides.
- No new i18n namespaces beyond an "Add cards" button label + panel title
  (`decks.addCards` may be reused or a shared key added).
- No changes to the deck panel's behavior or appearance.

## Verification (no test framework — per project convention)

- `npm run check` — assert **no new** problems on changed files (baseline is RED;
  gate via `npx eslint` on changed files + `npm run build` for the TS2589-class risks).
- Runtime (dev + Supabase):
  - Deck page panel unchanged (search, filters, EDHREC, legality, zone badges, add-to-zone).
  - Collection page: open panel → search → left-click opens card modal → right-click menu →
    "Add to collection" adds an owned copy (appears in grid).
  - Wishlist page: same, "Add to wishlist" adds an entry.
  - Deck-only features (EDHREC tab, legality toggle, zone badges, in-collection toggle)
    absent on collection/wishlist.
  - Panel expand/collapse + mobile fullscreen work on all three pages; page content reflows
    when the side panel is open (desktop).
