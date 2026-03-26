# AGENTS.md — scute_swarm

MTG collection manager — Next.js 16 + Supabase + Scryfall API.

## Common Pitfalls

- **Never group by `scryfallId`** for display — use `oracleId` via `CardStack`. Two copies of the same card from different editions = same `CardStack`.
- **Don't call `fetch()` against Scryfall directly** — always go through `scryfallGet`/`scryfallPost` in `src/lib/scryfall/fetcher.ts` (rate limiting, caching, dedup).
- **Always call `triggerSync()` after `enqueue()`** — the queue does not self-start.
- **`npm run sb:reset` is destructive** — drops and recreates the local DB.
- **Write the current localStorage format**: `{ scryfallId: string, entry: CardEntry }`. Legacy migration exists in `src/lib/collection/db/collection-migrations.ts` but new code must write the current format.
- **Don't add a context provider between `SyncQueueRunner` and `CollectionProvider`** without auditing whether it needs either.

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
- Generic infrastructure (`src/lib/supabase/`, `src/components/ui/`) is not owned by any feature
- No barrel exports (`index.ts`) — import files directly
- One component = one folder (`ComponentName/ComponentName.tsx` + `.module.css`)

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

### Collection State

- `src/lib/collection/store/collection-store.ts` — Zustand store; localStorage-backed, Supabase hydration on login, all mutation methods (`addCard`, `duplicateEntry`, `removeEntry`, `updateEntry`, `changePrint`, `clearCollection`)
- `src/lib/collection/context/CollectionContext.tsx` — wraps the store, exposes via `useCollectionContext()`
- `src/lib/collection/db/collection.ts` — Supabase CRUD: `fetchCollection`, `insertEntry`, `insertEntries`, `deleteEntryById`, `updateEntry`
- `src/lib/collection/db/collection-migrations.ts` — migrates legacy localStorage formats to current schema
- `src/lib/supabase/sync-queue.ts` — localStorage-backed offline queue (`enqueue` / `peek` / `dequeue` / `incrementRetry` / `skipFailed` / `clearQueue`)
- `src/lib/supabase/hooks/useSyncQueue.ts` — drives the sync loop; processes one op at a time

### Scryfall Integration

- `src/lib/scryfall/fetcher.ts` — `scryfallGet`/`scryfallPost`; rate-limit + in-memory cache + retry + in-flight deduplication
- `src/lib/scryfall/rate-limiter.ts` — 100ms sequential delay via promise chaining
- `src/lib/scryfall/cache.ts` — in-memory TTL cache (5 min, 1000 entries max)
- `src/lib/card-cache.ts` — IndexedDB persistent cache for `ScryfallCard` objects (24h TTL)
- `src/lib/scryfall/scryfall-query.ts` — `buildScryfallQuery()` + image URI helpers
- `src/lib/scryfall/endpoints/` — `cards.ts`, `sets.ts`, `symbols.ts`, `bulk-data.ts`

### Collection Display

- `src/lib/collection/hooks/useCollectionCards.ts` — hydrates entries into `Card[]` + `CardStack[]`; two-phase: IndexedDB cache first, then Scryfall `/cards/collection` in 75-card batches
- `src/lib/collection/hooks/useCollectionFiltering.ts` — filter + sort state over `CardStack[]`
- `src/lib/collection/shared/utils/filterCollectionCards.ts` — pure filter function (no state)

### Import System

- `src/lib/import/detect.ts` — format auto-detection by content scoring + file extension bonus
- `src/lib/import/formats/moxfield.ts` — Moxfield CSV parser
- `src/lib/import/formats/mtga.ts` — MTGA text format parser
- `src/lib/import/formats/index.ts` — `FORMAT_REGISTRY` + `getParser()`

### Auth + Routing

- `src/lib/supabase/contexts/AuthContext.tsx` — `useAuth()`, exposes `user` + `isLoading`
- `src/middleware.ts` — Supabase SSR session refresh

### App Structure

- `src/contexts/Providers.tsx` — provider nesting (see above)
- `src/app/layout.tsx` — root layout, mounts `Providers` + `Navbar`

## Data Model

### ID Concepts

- **`rowId`** (`CardEntry.rowId` = `cards.id`) — unique per physical copy in the collection
- **`scryfallId`** — identifies a specific printing/edition of a card
- **`oracleId`** — identifies the abstract card concept across all editions; used as `CardStack.oracleId`

### localStorage Keys

- `mtg-snap-collection` — `Record<rowId, { scryfallId: string, entry: CardEntry }>`
- `mtg-snap-sync-queue` — `SyncOp[]`
- `mtg-snap-signed-in` — presence flag; cleared on logout to wipe local collection

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
