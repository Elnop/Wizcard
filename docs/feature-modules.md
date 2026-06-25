# Feature Modules

## Principle

Every source belongs to the folder of the feature it serves: **feature > sub-feature > resource**, applied recursively.

## Template Structure

```
src/lib/<feature>/
  context/                    # React Context(s) — provider + useXxxContext()
  store/                      # Zustand store (if global state is needed)
  db/                         # Supabase CRUD + migrations
  hooks/                      # React hooks specific to the feature
  components/                 # UI components used across the feature
    <ComponentName>/
      <ComponentName>.tsx
      <ComponentName>.module.css
  <SubFeature>/               # Autonomous sub-feature — same rules recursively
    <SubFeature>.tsx
    <SubFeature>.module.css
    hooks/
    components/
      <ChildComponent>/
        <ChildComponent>.tsx
        <ChildComponent>.module.css
  shared/                     # Shared between ≥2 sub-features
    utils/
    styles/
    types/
```

## Rules

1. **Component folder only when ≥2 files.** A component with both `.tsx` and `.module.css` gets a folder `ComponentName/ComponentName.tsx` + `ComponentName.module.css`. A component with only a `.tsx` (no CSS) stays as a flat file.
2. **No barrel exports.** No `index.ts`. Import the file directly: `import { Foo } from '@/lib/feature/components/Foo/Foo'`.
3. **Page-specific code lives with the page.** Components used by a single page go in `src/app/<page>/components/`. Hooks used by a single page go in `src/app/<page>/`. Only code shared across ≥2 pages belongs in `src/lib/<feature>/`.
4. **Generic infrastructure stays in its own module.** `src/lib/supabase/` owns auth, the sync queue, and the Supabase client. A feature module imports from it but does not own it.
5. **`shared/` only for things used by ≥2 sub-features.** Don't preemptively create `shared/` for a single consumer — move to `shared/` when the second consumer appears.
6. **Sub-features follow the same rules recursively.** A sub-feature folder can have its own `hooks/`, `components/`, `shared/`, etc.
7. **Folders only when there are ≥2 files.** A single hook doesn't need a `hooks/` folder. Create the folder when a second file of the same type appears.

## Where Things Do NOT Go

| Source type                        | Does NOT go in `src/lib/<feature>/` | Goes in                                     |
| ---------------------------------- | ----------------------------------- | ------------------------------------------- |
| Next.js route                      | `src/lib/<feature>/page.tsx`        | `src/app/<feature>/page.tsx`                |
| Page-specific component            | `src/lib/<feature>/components/`     | `src/app/<page>/components/`                |
| Page-specific hook                 | `src/lib/<feature>/hooks/`          | `src/app/<page>/useXxx.ts`                  |
| Supabase client                    | any feature folder                  | `src/lib/supabase/client.ts`                |
| Auth state                         | any feature folder                  | `src/lib/supabase/contexts/AuthContext.tsx` |
| Sync queue                         | any feature folder                  | `src/lib/supabase/sync-queue.ts`            |
| Generic UI (Button, Modal, Navbar) | any feature folder                  | `src/components/`                           |

### Feature components vs. generic UI

A component shared between ≥2 pages stays in `src/lib/<feature>/components/` when it is coupled to the feature's domain (imports feature-specific types, hooks, or logic). It goes in `src/components/` only when it is purely presentational with zero domain dependency.

**Example:** `FilterModal` imports Scryfall types (`ScryfallSortOrder`, `ScryfallColor`, `ScryfallSet`) and orchestrates Scryfall search filters → it belongs in `src/lib/search/components/`, not `src/components/`. By contrast, `Button` and `Modal` have no domain coupling → `src/components/`.

## Functional Domains vs. External-Integration Modules

`src/lib/` holds two kinds of modules:

- **Functional (domain) modules** — `card`, `collection`, `deck`, `wishlist`,
  `import`, `mpc`, `edhrec`, `pdf`, `mtg`, `search`. They own business logic and
  domain types. Each has its own `db/` that maps `row ↔ domain type`.
- **External-integration modules** — `supabase`, `scryfall`. They own ALL
  communication with one external service and expose it to the rest of the app.
  They contain **no business logic and no domain types** in their query layer.

### The Supabase boundary rule

`src/lib/supabase/` is the **single place** that may touch the Supabase client
(`createClient`, `.from()`, `.auth.*`, `.storage.*`, `.rpc()`). The goal is a
migration-friendly seam: swapping backends should rewrite only this folder.

```
src/lib/supabase/
  client.ts / server.ts # client factories
  queries/ # ONLY place issuing client.from(...) — returns/accepts ROWS
    cards.ts # cards + public_collection_cards
    decks.ts # decks + deck_folders + deck-scoped cards
    custom-cards.ts # custom_cards + custom_card_sources
    custom-cards.server.ts  # server-only (…ById fetchers); kept separate so the
                            # browser query file never imports next/headers
  auth/ # ONLY place issuing client.auth.\* — returns plain results
    auth-server.ts # getCurrentUser, exchangeCodeForSession, verifyEmailOtp
    auth-client.ts # signInWithEmailOtp, verifyEmailOtpClient
  sync-queue.ts / ... # generic offline infra
```

A domain `db/` (e.g. `collection/db/collection.ts`) imports from
`supabase/queries/*` and does `row → CardEntry` mapping. It must NOT call
`createClient` or `.from()` directly.

**Row types** (`CardDbRow`, `DeckDbRow`, …) are the shared contract between the
two layers. `CardDbRow` lives in `card/db/cardRow.ts`; table-specific row types
live alongside their queries in `supabase/queries/*`.

**Type-only exception:** the queries layer may import a domain _type_ (e.g.
`CardType`) when it is part of a filter/query contract — type-only imports carry
no runtime coupling. It must never import domain _values_ or _logic_.

The only allowed Supabase-client caller outside this folder is `src/proxy.ts`
(Next.js middleware entry, framework-imposed), which delegates to
`supabase/middleware.ts`.

> `scryfall` follows the same spirit but is broader: it also owns React hooks and
> presentational components (mana symbols) coupled to Scryfall data. The "no
> domain logic" constraint applies to its fetch/query layer; reuse beyond that is
> by design.

## Decision Guide

When adding a new file, ask:

```
Is it used by a single page only?
  Yes → src/app/<page>/components/ (component) or src/app/<page>/useXxx.ts (hook)
  No  → does it belong to a specific feature?
    Yes → src/lib/<feature>/
      Is it a component?  → components/<ComponentName>/<ComponentName>.tsx
      Is it a hook?       → hooks/useXxx.ts
      Is it a DB layer?   → db/<name>.ts
      Is it a store?      → store/<name>.ts
      Is it a context?    → context/<Name>Context.tsx
      Is it shared between ≥2 sub-features? → shared/utils/ or shared/styles/
      Is it a sub-feature? → <SubFeature>/ (apply rules recursively)
    No → is it generic UI?
      Yes → src/components/
      No  → is it Supabase infrastructure?
        Yes → src/lib/supabase/
        No  → src/lib/<domain>/
```

## Example: Collection Feature

Shared code (used by ≥2 pages) stays in `src/lib/collection/`:

```
src/lib/collection/
  context/
    CollectionContext.tsx           # Provider + useCollectionContext()
  store/
    collection-store.ts             # Zustand store; localStorage + Supabase hydration
  db/
    collection.ts                   # Supabase CRUD: fetchCollection, insertEntry, deleteEntryById…
    collection-migrations.ts        # Migrates legacy localStorage formats to current schema
  components/
    CollectionView.tsx              # Owner-agnostic view (no own CSS → flat); used by 2 pages
    CollectionView.module.css       # Layout styles for CollectionView
    CollectionFiltersAside/         # Filter sidebar (its CSS is also reused by the sets page)
    ExportMenu/                     # Export menu (collection + public collection pages)
  hooks/
    useCollectionCards.ts           # entries → Card[] + CardStack[] (IndexedDB then Scryfall)
    useCollectionFiltering.ts       # filter + sort state over CardStack[]
  utils/
    stats.ts                        # computeCollectionStats()
  constants.ts
```

> `filterCollectionCards.ts` is a pure, card-level filter shared beyond the
> collection feature, so it lives in `src/lib/card/utils/filterCollectionCards.ts`.

Card display components (used across collection + card detail + search) live in `src/lib/card/`:

```
src/lib/card/
  components/
    CardImage/                      # Card image with fallback
    CardLightbox/                   # Image zoom modal
    CardList/                       # Card list orchestrator (grid/table toggle)
    CardListGrid/                   # Grid view
    CardListTable/                  # Table view
    CardModal/                      # Card detail modal
    EditCardModal/                  # Edit per-copy metadata
    CardPrintPickerModal/           # Pick a different printing
    …                               # OwnershipBadge, DeckBadge, PrintList, etc.
  hooks/
    useCardModal.ts                 # Card modal state management
```

Page-specific code lives with the page in `src/app/collection/`:

```
src/app/collection/
  page.tsx                          # Next.js route
  layout.tsx
  page.module.css                   # Page-only styles (loading placeholder, empty state)
  components/
    ImportModal/                    # Import flow — only used on this page
```

Per rule 3, any hook, util, or context used exclusively by this page belongs here — not in `src/lib/collection/`. Conversely, once a second page imports something (as the public `/users/[userId]/collection` page does for `CollectionView`, `ExportMenu`, and `useCollectionCards`), it moves up into `src/lib/collection/`.

Infrastructure stays in `src/lib/supabase/`:

```
src/lib/supabase/
  client.ts                         # Used by db/collection.ts but owned by supabase module
  sync-queue.ts                     # Generic offline queue — not collection-specific
  hooks/useSyncQueue.ts             # Drives the sync loop
  contexts/SyncQueueContext.tsx     # triggerSync() provider
```
