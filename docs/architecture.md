# Architecture

Wizcard is a Next.js 16 App Router application for managing a Magic: The Gathering card collection. It uses Scryfall as the card data source, Supabase for auth and persistent storage, and localStorage for offline-first operation.

## Directory Map

```
src/
├── app/                        # Next.js App Router — pages + page-specific components
│   ├── layout.tsx              # Root layout (mounts Providers + Navbar)
│   ├── globals.css
│   ├── (landing)/              # Route group for / (landing page)
│   │   ├── page.tsx
│   │   ├── hooks/              # useInView
│   │   └── components/
│   │       ├── Hero/           # Hero section
│   │       │   └── backdrops/  # Animated backdrop variants (7) + RandomBackdrop
│   │       ├── CardShowcase/
│   │       ├── Features/
│   │       └── CallToAction/
│   ├── search/
│   │   ├── page.tsx            # Card search
│   │   └── useSearchFiltersFromUrl.ts  # Page-specific hook
│   ├── collection/
│   │   ├── page.tsx            # User collection
│   │   ├── useCollectionCards.ts       # Page-specific hook
│   │   ├── useCollectionFiltering.ts   # Page-specific hook
│   │   ├── utils/              # filterCollectionCards, stats
│   │   └── components/         # CollectionFiltersAside, ImportModal
│   ├── card/[id]/
│   │   ├── page.tsx            # Card detail (server-rendered)
│   │   └── components/         # CardPageHeader, CardTabs, tabs/
│   └── auth/                   # login, confirm, error pages
│
├── components/                 # Generic UI (reusable across features)
│   ├── Button/, Modal/, Spinner/, Navbar/
│   └── ConfirmModal/
│
├── lib/
│   ├── card/                   # Card display components + hooks
│   │   ├── components/         # CardImage, CardLightbox, CardList, CardListGrid,
│   │   │                       # CardListTable, CardModal, EditCardModal, CardPrintPickerModal
│   │   └── hooks/              # useCardModal
│   │
│   ├── collection/             # Collection feature — shared code only
│   │   ├── context/            # CollectionContext + useCollectionContext()
│   │   ├── store/              # Zustand store (localStorage + Supabase hydration)
│   │   ├── db/                 # Supabase CRUD + data migrations
│   │   └── constants.ts
│   │
│   ├── scryfall/               # Scryfall API integration
│   │   ├── components/         # ManaSymbol/, SymbolText.tsx
│   │   ├── endpoints/          # cards, sets, symbols
│   │   ├── hooks/              # useScryfallCardSearch, useSets, useSymbols, useCardPrints
│   │   ├── types/              # ScryfallCard, ScryfallSet, ScryfallSortOrder, API param types
│   │   ├── store/              # Zustand store (sets + symbols cache)
│   │   ├── utils/              # fetcher, rate-limiter, cache, errors, scryfall-query
│   │   └── constants.ts        # BATCH_SIZE and other Scryfall constants
│   │
│   ├── supabase/               # Auth + sync infrastructure
│   │   ├── contexts/           # AuthContext, SyncQueueContext
│   │   ├── hooks/              # useSyncQueue
│   │   ├── components/         # SyncQueueRunner, SyncIndicator
│   │   ├── sync-queue.ts       # Offline queue (localStorage)
│   │   ├── client.ts           # Supabase browser client
│   │   ├── server.ts           # Supabase server-side client
│   │   └── middleware.ts       # SSR session refresh (re-exported by src/proxy.ts)
│   │
│   ├── import/                 # Collection import system
│   │   ├── formats/            # registry.ts + mtga.ts
│   │   ├── contexts/           # ImportContext
│   │   ├── hooks/              # useImport, useImportFileHandling, …
│   │   └── utils/              # detect.ts, types.ts, identifier-dedup.ts
│   │
│   ├── search/                 # Card search — shared search components + hooks
│   │   ├── components/         # FilterModal, SearchBar (used by search + collection pages)
│   │   │   └── filters/        # ColorFilter, RarityFilter, TypeFilter, SetFilter, CmcFilter, OracleTextFilter, SortFilter
│   │   └── hooks/              # useDebounce, useMultiSelect
│   │
│   ├── moxfield/               # Moxfield format (parse, serialize, import-adapter)
│   ├── mtg/                    # MTG-specific utilities (language mappings)
│   └── card-cache.ts           # IndexedDB cache for ScryfallCard objects (24h)
│
├── contexts/
│   └── Providers.tsx           # App-wide provider tree
│
└── types/
    └── cards.ts                # CardEntry, Card, CardStack, CollectionStats
```

Feature modules follow the **feature > sub-feature > resource** pattern — see `docs/feature-modules.md`.

## Page-Specific Colocation

Code used by a single page lives with that page in `src/app/<page>/`, not in `src/lib/`.

| Resource type            | Location                              |
| ------------------------ | ------------------------------------- |
| Page-specific components | `src/app/<page>/components/`          |
| Page-specific hooks      | `src/app/<page>/` (or `hooks/` if ≥2) |
| Page-specific utils      | `src/app/<page>/utils/`               |
| Page-specific contexts   | `src/app/<page>/contexts/`            |

Code stays in `src/lib/<feature>/` only when it is shared between ≥2 pages or consumed by global infrastructure (providers, sync queue, middleware).

### Example: collection page

```
src/app/collection/
  page.tsx
  layout.tsx
  page.module.css
  useCollectionCards.ts            # entries → Card[] + CardStack[]
  useCollectionFiltering.ts        # filter + sort state
  utils/
    filterCollectionCards.ts       # pure filter function
    stats.ts                       # collection statistics
  components/
    CollectionFiltersAside/        # filter sidebar
    ImportModal/                   # import flow
```

Shared collection code (used by card detail page, providers, or sync) stays in `src/lib/collection/`:

| Stays in `src/lib/collection/`  | Why                                                          |
| ------------------------------- | ------------------------------------------------------------ |
| `context/CollectionContext.tsx` | Used by collection page, card detail page, and Providers.tsx |
| `store/collection-store.ts`     | Backing store for CollectionContext (global)                 |
| `db/`                           | Used by sync queue (global infrastructure)                   |

## App Routes

| Route           | Rendering | Description                       |
| --------------- | --------- | --------------------------------- |
| `/`             | Server    | Landing page (Hero)               |
| `/search`       | Client    | Card search with advanced filters |
| `/collection`   | Client    | User collection management        |
| `/card/[id]`    | Server    | Card detail page (SEO-friendly)   |
| `/auth/login`   | Client    | Login / registration form         |
| `/auth/confirm` | Server    | Email confirmation callback       |
| `/auth/error`   | Server    | Auth error display                |

## Data Flow

### Search

```
/search page
    → useScryfallCardSearch (hook)
    → buildScryfallQuery() + scryfallGet() (fetcher.ts)
    → Scryfall API
    → in-memory cache (5 min)
    → CardGrid component
```

### Collection

```
/collection page
    → useCollectionContext() → collection-store.ts (Zustand)
        ├── localStorage (wizcard-collection) — source of truth
        └── Supabase public.cards — remote persistence via sync queue
    → useCollectionCards (hook)
        ├── IndexedDB card cache (24h) — first
        └── Scryfall /cards/collection in 75-card batches — fallback
    → useCollectionFiltering (hook) → filterCollectionCards() (pure)
    → CardList / CardStack components
```

### Collection Mutation

```
User action (add/edit/remove card)
    → useCollection mutation method
    → localStorage update (immediate)
    → enqueue(SyncOp) + triggerSync()
    → SyncQueueRunner processes queue
    → Supabase upsert/delete
```

### Import

```
File drop / paste
    → detectFormat(text, fileName)
    → getParser(formatId)(text) → ParsedImportResult
    → Scryfall /cards/collection identifier lookup
    → importCards() → addCard() per result
    → Collection updated + sync enqueued
```

## Server vs. Client

The collection is entirely **client-side** — no server component reads or writes collection data. This is intentional: it enables offline operation via localStorage + sync queue.

Server components are used for:

- The landing page (`/`)
- Card detail pages (`/card/[id]`) — for SEO
- Auth callback routes

Everything else (search, collection, modals) is client-rendered.
