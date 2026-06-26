# AGENTS.md — scute_swarm

Wizcard — MTG collection manager — Next.js 16 + Supabase + Scryfall API.

## Common Pitfalls

- **Never group by `scryfallId`** for display — use `oracleId` via `CardStack`. Two copies of the same card from different editions = same `CardStack`.
- **Don't call `fetch()` against Scryfall directly** — always go through `scryfallGet`/`scryfallPost` in `src/lib/scryfall/utils/fetcher.ts` (rate limiting, caching, dedup).
- **Always call `triggerSync()` after `enqueue()`** — the queue does not self-start.
- **`npm run sb:reset` is destructive** — drops and recreates the local DB.
- **Write the current localStorage format**: `{ scryfallId: string, entry: CardEntry }`. Legacy migration exists in `src/lib/collection/db/collection-migrations.ts` but new code must write the current format.
- **Don't add a context provider between `SyncQueueRunner` and `CollectionProvider`** without auditing whether it needs either.
- **Never call the Supabase client outside `src/lib/supabase/`.** All `createClient` / `.from()` / `.auth.*` calls live in `supabase/queries/*` (data) or `supabase/auth/*` (auth) and return/accept ROWS only; domain `db/` modules map rows ↔ domain types. See `docs/feature-modules.md` § "Functional Domains vs. External-Integration Modules". (`src/proxy.ts` is the sole framework-imposed exception.)

## Development Commands

- `npm run dev` — dev server (localhost:3000)
- `npm run build` — production build
- `npm run check` — TypeScript + ESLint + Prettier (read-only, run before committing)
- `npm run check:fix` — auto-fix ESLint + Prettier issues
- `npm run sb:start` / `sb:stop` — start/stop local Supabase
- `npm run sb:reset` — **destructive** — drop DB and re-apply all migrations
- `npm run sb:migrate` — apply pending migrations only
- `npm run sb:studio` — Supabase Studio (port 54323)

## Architecture

- Next.js 16 App Router (`src/app/`)
- TypeScript strict mode, path alias `@/*` → `./src/*`
- React Compiler is **disabled** (`reactCompiler: false` in `next.config.ts`)
- CSS Modules per component, global CSS in `src/app/globals.css`
- Supabase for auth + database (RLS: all ops scoped to `auth.uid() = owner_id`)

## Module Architecture

Feature code lives in `src/lib/<feature>/`, organized by **feature > sub-feature > resource** — applied recursively. See `docs/feature-modules.md` for the full rules and template.

Key constraints:

- Next.js routes (`page.tsx`, `layout.tsx`) stay in `src/app/` — imposed by the framework
- **Page-specific components** live in `src/app/<page>/components/`; page-specific hooks live in `src/app/<page>/`. Only shared code stays in `src/lib/`.
- Generic infrastructure (`src/lib/supabase/`, `src/components/`) is not owned by any feature
- No barrel exports (`index.ts`) — import files directly
- A component gets its own folder (`ComponentName/ComponentName.tsx` + `.module.css`) only when it has ≥2 files. A single `.tsx` with no CSS stays as a flat file.
- Same rule for grouping folders (`context/`, `hooks/`, `components/`, `utils/`): create one only for ≥2 files of that kind. A lone context/hook/component sits one level up (e.g. `collection/CollectionCardsContext.tsx`, not `collection/context/CollectionCardsContext.tsx`); introduce the folder when the second file appears. See `docs/feature-modules.md` rule 7.

### Feature Modules (`src/lib/`)

- `card/` — card display + per-copy hooks (see Card Display)
- `collection/` — collection state, shared collection view/filters/export, hydration hooks
- `deck/` — deck + folder store, DB layer, deck-stats / tokens / cover-art utils
- `wishlist/` — wishlist context + store + DB
- `search/` — search bar + Scryfall filter panel
- `scryfall/` — Scryfall API client, caches, endpoints, mana-symbol components
- `import/` — format detection + `FORMAT_REGISTRY` + import hooks/context
- `moxfield/`, `cardnexus/`, `delver-lens/` — per-format import adapters (parse/serialize/types)
- `mpc/` — custom (MakePlayingCards) card parsing, tags, Scryfall resolver
- `edhrec/` — EDHREC recommendation fetch/convert + `useEdhrecRecommendations`
- `pdf/` — PDF card-sheet generation
- `csv/` — RFC 4180 CSV read/write helpers
- `mtg/` — MTG domain constants (colors, languages)
- `supabase/` — generic infra: client, auth, sync queue (not owned by any feature)

### Routes (`src/app/`)

`/` (landing), `/collection`, `/search`, `/decks`, `/decks/[id]`, `/sets`, `/sets/[code]`, `/wishlist`, `/card/[id]`, `/users/[userId]/collection`, `/users/[userId]/decks`, `/auth/*`.

## Provider Nesting Order

The order is load-bearing. Do not reorder without auditing dependencies.

```
AuthProvider
  SyncQueueRunner          ← needs user from AuthProvider
    CollectionProvider     ← needs triggerSync from SyncQueueRunner
      ImportProvider       ← needs collection methods from CollectionProvider
```

## Key Files

### Core Types

- `src/types/cards.ts` — `CardEntry`, `Card`, `CardStack`, `CollectionStats`, `CardCondition`
- `src/types/decks.ts` — deck + folder types (`Deck`, `DeckCard`, `Folder`, …)

### Collection State

- `src/lib/collection/store/collection-store.ts` — Zustand store; localStorage-backed, Supabase hydration on login, all mutation methods (`addCard`, `duplicateEntry`, `removeEntry`, `updateEntry`, `changePrint`, `clearCollection`)
- `src/lib/collection/context/CollectionContext.tsx` — wraps the store, exposes via `useCollectionContext()`
- `src/lib/collection/db/collection.ts` — Supabase CRUD: `fetchCollection`, `insertEntry`, `insertEntries`, `deleteEntryById`, `updateEntry`
- `src/lib/collection/db/collection-migrations.ts` — migrates legacy localStorage formats to current schema
- `src/lib/collection/components/CollectionView.tsx` — shared owner-agnostic collection view (filters aside + grid); used by `/collection` + `/users/[userId]/collection`
- `src/lib/collection/components/CollectionFiltersAside/` — filter sidebar (its CSS is also reused by the sets page)
- `src/lib/collection/components/ExportMenu/` — collection export menu (shared between `/collection` + `/users/[userId]/collection`)
- `src/lib/collection/hooks/useCollectionCards.ts` — hydrates entries into `Card[]` + `CardStack[]`; two-phase: IndexedDB cache first, then Scryfall `/cards/collection` in 75-card batches
- `src/lib/collection/hooks/useCollectionFiltering.ts` — filter + sort state over `CardStack[]`
- `src/lib/collection/utils/stats.ts` — collection statistics calculation (`computeCollectionStats`)
- `src/lib/card/utils/filterCollectionCards.ts` — pure filter function (no state)
- `src/lib/supabase/sync-queue.ts` — localStorage-backed offline queue (`enqueue` / `peek` / `dequeue` / `incrementRetry` / `skipFailed` / `clearQueue`)
- `src/lib/supabase/useSyncQueue.ts` — drives the sync loop; processes one op at a time

### Scryfall Integration

- `src/lib/scryfall/utils/fetcher.ts` — `scryfallGet`/`scryfallPost`; rate-limit + in-memory cache + retry + in-flight deduplication
- `src/lib/scryfall/utils/rate-limiter.ts` — 100ms sequential delay via promise chaining
- `src/lib/scryfall/utils/cache.ts` — in-memory TTL cache (5 min, 1000 entries max)
- `src/lib/scryfall/utils/card-cache.ts` — IndexedDB persistent cache for `ScryfallCard` objects (24h TTL)
- `src/lib/scryfall/utils/scryfall-query.ts` — `buildScryfallQuery()` + `getScryfallCardImageUriBySize()`
- `src/lib/scryfall/endpoints/` — `cards.ts`, `sets.ts`, `symbols.ts`
- `src/lib/scryfall/components/ManaSymbol/` — mana symbol rendering (uses `next/image`)
- `src/lib/scryfall/components/SymbolText.tsx` — inline mana symbol text

### Card Display

- `src/lib/card/components/` — CardImage, CardLightbox, CardList, CardListGrid, CardListTable, CardModal, EditCardModal, CardPrintPickerModal, CardTokensSection, CustomCardBadge, DeckBadge, OwnershipBadge, PrintList, UseCollectionCopyModal, LocalizedCardThumb
- `src/lib/card/hooks/` — useCardModal, useCardTokens, useDeckCardModal
- Collection hydration/filtering hooks now live in `src/lib/collection/hooks/` (see Collection State above)

### Search

- `src/lib/search/components/SearchBar/SearchBar.tsx` — reusable search input (used by search + collection pages)
- `src/lib/search/components/FilterModal/FilterModal.tsx` — Scryfall filter panel (colors, rarity, type, set, CMC, sort); shared between search + collection/import
- `src/lib/search/hooks/useDebounce.ts` — debounce hook for search input
- `src/lib/search/hooks/useMultiSelect.ts` — multi-select hook for filter components

### Import System

- `src/lib/import/utils/detect.ts` — format auto-detection by content scoring + file extension bonus
- `src/lib/import/formats/registry.ts` — `FORMAT_REGISTRY` + `getParser()` (registers moxfield, cardnexus, mtga, delverlens)
- `src/lib/import/formats/mtga.ts` — MTGA text format parser
- Per-format adapters live in their own modules: `src/lib/moxfield/import-adapter.ts` (Moxfield CSV), `src/lib/cardnexus/import-adapter.ts` (CardNexus), `src/lib/delver-lens/import-adapter.ts` (Delver Lens SQLite). Each wraps its module's `parse.ts`.

### Auth + Routing

- `src/lib/supabase/contexts/AuthContext.tsx` — `useAuth()`, exposes `user` + `isLoading`
- `src/proxy.ts` — Supabase SSR session refresh (Next.js middleware entry point)

### App Structure

- `src/contexts/Providers.tsx` — provider nesting (see above)
- `src/app/layout.tsx` — root layout, mounts `Providers` + `Navbar`

### Generic UI Components

- `src/components/Button/` — variants: primary, secondary, ghost, danger
- `src/components/Modal/` — reusable modal with glassmorphism
- `src/components/ConfirmModal/` — confirmation dialog
- `src/components/Navbar/` — top navigation
- `src/components/Spinner/` — loading indicator

## Data Model

### ID Concepts

- **`rowId`** (`CardEntry.rowId` = `cards.id`) — unique per physical copy in the collection
- **`scryfallId`** — identifies a specific printing/edition of a card
- **`oracleId`** — identifies the abstract card concept across all editions; used as `CardStack.oracleId`

### localStorage Keys

- `wizcard-collection` — `Record<rowId, { scryfallId: string, entry: CardEntry }>`
- `wizcard-sync-queue` — `SyncOp[]`
- `wizcard-signed-in` — presence flag; cleared on logout to wipe local collection

### Supabase Table: `public.cards`

| Column           | Type        | Corresponds to            |
| ---------------- | ----------- | ------------------------- |
| `id`             | uuid PK     | `CardEntry.rowId`         |
| `owner_id`       | uuid FK     | `auth.users.id`           |
| `scryfall_id`    | text        | Scryfall print UUID       |
| `date_added`     | timestamptz | `CardEntry.dateAdded`     |
| `is_foil`        | boolean     | `CardEntry.isFoil`        |
| `foil_type`      | text        | `'foil'` or `'etched'`    |
| `condition`      | text        | NM / LP / MP / HP / DMG   |
| `language`       | text        | `MtgLanguage`             |
| `purchase_price` | text        | `CardEntry.purchasePrice` |
| `for_trade`      | boolean     | `CardEntry.forTrade`      |
| `alter`          | boolean     | `CardEntry.alter`         |
| `proxy`          | boolean     | `CardEntry.proxy`         |
| `tags`           | text[]      | `CardEntry.tags`          |

## Code Style

- Prettier: tabs (width 2), single quotes, trailing commas (es5)
- JSON/YAML: 2 spaces (`.editorconfig`)
- Husky + lint-staged: ESLint + Prettier auto-run on staged files pre-commit

## Further Documentation

- `docs/feature-modules.md` — feature module pattern: rules, template structure, example
- `docs/architecture.md` — directory map, route definitions, data flow diagrams
- `docs/data-model.md` — full type definitions, ID concepts, localStorage format
- `docs/scryfall.md` — Scryfall API integration, caching strategy, query builder
- `docs/offline-sync.md` — offline-first architecture, sync queue processing, login merge
- `docs/import-formats.md` — supported formats, auto-detection, import flow
- `docs/guides/local-setup.md` — step-by-step local dev setup
- `docs/guides/migrations.md` — migration commands, RLS patterns
- `docs/guides/adding-import-format.md` — how to add a new import format
- `docs/guides/ai-config-files.md` — organisation des fichiers de config IA (AGENTS.md, CLAUDE.md, etc.)
