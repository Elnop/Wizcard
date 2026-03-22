# CLAUDE.md

## Development Commands

- `npm run dev` — dev server (localhost:3000)
- `npm run build` — production build
- `npm run start` — production server
- `npm run check` — TypeScript + ESLint + Prettier (read-only, run before committing)
- `npm run check:fix` — auto-fix ESLint + Prettier issues
- `npm run lint` — ESLint only
- `npm run format` — Prettier write
- `npm run sb:start` — start local Supabase stack
- `npm run sb:stop` — stop local Supabase
- `npm run sb:restart` — restart Supabase
- `npm run sb:status` — show local URLs + keys
- `npm run sb:reset` — **destructive** — drop DB and re-apply all migrations
- `npm run sb:migrate` — apply pending migrations only
- `npm run sb:studio` — open Supabase Studio (port 54323)
- `npm run sb:mail` — open Inbucket email inbox for auth emails (port 54324)

## Architecture

- Next.js 16 App Router (`src/app/`)
- TypeScript strict mode, path alias `@/*` → `./src/*`
- React Compiler is **disabled** (`reactCompiler: false` in `next.config.ts`)
- CSS Modules per component, global CSS in `src/app/globals.css`
- ESLint flat config (`eslint.config.mjs`): core-web-vitals + typescript + prettier

## Code Style

- Prettier: tabs (width 2), single quotes, trailing commas (es5)
- JSON/YAML: 2 spaces (`.editorconfig`)
- Husky + lint-staged: ESLint + Prettier auto-run on staged files pre-commit

## Key Files

### Core Types

- `src/types/cards.ts` — `CardEntry`, `Card`, `CardStack`, `CollectionStats`, `CardCondition`

### Collection State

- `src/lib/supabase/hooks/useCollection.ts` — source of truth; localStorage-backed external store, Supabase hydration on login, all mutation methods (`addCard`, `duplicateEntry`, `removeEntry`, `updateEntry`, `changePrint`, `clearCollection`), legacy format migration
- `src/lib/supabase/contexts/CollectionContext.tsx` — wraps `useCollection`, exposes via `useCollectionContext()`
- `src/lib/supabase/collection.ts` — Supabase CRUD: `fetchCollection`, `insertEntry`, `insertEntries`, `deleteEntryById`, `updateEntry`
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

- `src/hooks/useCollectionCards.ts` — hydrates entries into `Card[]` + `CardStack[]`; two-phase: IndexedDB cache first, then Scryfall `/cards/collection` in 75-card batches
- `src/hooks/useCollectionFilters.ts` — pure client-side filter + sort over `Card[]`

### Import System

- `src/lib/import/detect.ts` — format auto-detection by content scoring + file extension bonus
- `src/lib/import/formats/moxfield.ts` — Moxfield CSV parser
- `src/lib/import/formats/mtga.ts` — MTGA text format parser
- `src/lib/import/formats/index.ts` — `FORMAT_REGISTRY` + `getParser()`
- `src/lib/import/types.ts` — `ImportFormatDescriptor`, `ParsedImportRow`, `ImportResult`, `FormatParser`

### Auth + Routing

- `src/lib/supabase/contexts/AuthContext.tsx` — `useAuth()`, exposes `user` + `isLoading`
- `src/middleware.ts` — Supabase SSR session refresh; matcher excludes static assets

### App Structure

- `src/contexts/Providers.tsx` — provider nesting (see below)
- `src/app/layout.tsx` — root layout, mounts `Providers` + `Navbar`

## Provider Nesting Order

The order is load-bearing. Do not reorder without auditing dependencies.

```
AuthProvider
  SyncQueueRunner          ← needs user from AuthProvider
    CollectionProvider     ← needs triggerSync from SyncQueueRunner
      ImportProvider       ← needs collection methods from CollectionProvider
```

## Data Model

### localStorage Keys

- `mtg-snap-collection` — canonical collection state: `Record<rowId, { scryfallId: string, entry: CardEntry }>`
- `mtg-snap-sync-queue` — pending sync ops: `SyncOp[]`
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

RLS: all operations scoped to `auth.uid() = owner_id`.

### ID Concepts

- **`rowId`** (`CardEntry.rowId` = `cards.id`) — unique per physical copy in the collection
- **`scryfallId`** — identifies a specific printing/edition of a card
- **`oracleId`** — identifies the abstract card concept (same card name across all editions); used as `CardStack.oracleId`

## Common Pitfalls

- **Never group by `scryfallId`** for display — use `oracleId` via `CardStack`. Two copies of the same card from different editions = same `CardStack`.
- **Don't call `fetch()` against Scryfall directly** — always go through `scryfallGet`/`scryfallPost` in `fetcher.ts` (rate limiting, caching, dedup).
- **Always call `triggerSync()` after `enqueue()`** — the queue does not self-start.
- **`npm run sb:reset` is destructive** — drops and recreates the local DB.
- **Write the current localStorage format**: `{ scryfallId: string, entry: CardEntry }`. Legacy migration exists in `useCollection.ts` but new code must write the current format.
- **Don't add a context provider between `SyncQueueRunner` and `CollectionProvider`** without auditing whether it needs either.
