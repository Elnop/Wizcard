# Architecture

MTG Snap is a Next.js 16 App Router application for managing a Magic: The Gathering card collection. It uses Scryfall as the card data source, Supabase for auth and persistent storage, and localStorage for offline-first operation.

## Directory Map

```
src/
├── app/                    # Next.js App Router pages (routes only — no library code)
│   ├── page.tsx            # Landing page
│   ├── layout.tsx          # Root layout (mounts Providers + Navbar)
│   ├── search/page.tsx     # Card search
│   ├── collection/page.tsx # User collection
│   ├── card/[id]/page.tsx  # Card detail (server-rendered)
│   └── auth/               # login, confirm, error pages
│
├── components/             # Generic UI components (reusable across features)
│   ├── cards/              # CardGrid, CardDetail, CardImage
│   ├── search/             # Search filters and results
│   ├── ui/                 # Shared UI: Button, Modal, Navbar, Spinner, ManaSymbol
│   ├── auth/               # Auth-related UI
│   ├── landing/            # Hero landing component
│   └── sync/               # Sync status indicator
│
├── lib/
│   ├── collection/         # Collection feature module (see docs/feature-modules.md)
│   │   ├── context/        # CollectionContext — provider + useCollectionContext()
│   │   ├── store/          # Zustand store (localStorage + Supabase hydration)
│   │   ├── db/             # Supabase CRUD + data migrations
│   │   ├── hooks/          # useCollectionCards, useCollectionFiltering
│   │   ├── components/     # AddToCollectionButton, CollectionFiltersAside, ImportPreviewModal…
│   │   ├── CardCollectionModal/  # Sub-feature: card detail modal + CopyEditModal + PrintPickerModal
│   │   └── shared/         # Pure utils + styles shared across sub-features
│   │
│   ├── scryfall/           # Scryfall API integration
│   │   ├── endpoints/      # API call functions (cards, sets, symbols, bulk-data)
│   │   ├── hooks/          # useScryfallCardSearch, useSets, useSymbols, useCardPrints
│   │   ├── types/          # ScryfallCard, ScryfallSet, etc.
│   │   ├── fetcher.ts      # HTTP layer: rate-limit + cache + dedup
│   │   ├── cache.ts        # In-memory TTL cache (5 min)
│   │   ├── rate-limiter.ts # 100ms sequential delay
│   │   └── scryfall-query.ts # Query builder + image URI helpers
│   │
│   ├── supabase/           # Auth + sync infrastructure (not feature-specific)
│   │   ├── contexts/       # AuthContext, SyncQueueContext
│   │   ├── hooks/          # useSyncQueue
│   │   ├── components/     # SyncQueueRunner, SyncIndicator
│   │   ├── sync-queue.ts   # Offline queue (localStorage)
│   │   ├── client.ts       # Supabase browser client
│   │   └── server.ts       # Supabase server-side client
│   │
│   ├── import/             # Collection import system
│   │   ├── formats/        # Moxfield CSV + MTGA parsers + FORMAT_REGISTRY
│   │   ├── contexts/       # ImportContext
│   │   ├── hooks/          # useImport
│   │   ├── detect.ts       # Format auto-detection
│   │   └── types.ts        # ImportFormatDescriptor, ParsedImportRow, etc.
│   │
│   ├── moxfield/           # Moxfield export format (parse + serialize)
│   ├── mtg/                # MTG-specific utilities (language mappings)
│   └── card-cache.ts       # IndexedDB cache for ScryfallCard objects (24h)
│
├── hooks/                  # App-wide React hooks (not tied to a single feature)
│   ├── useInfiniteScroll.ts    # Intersection observer sentinel
│   ├── useDebounce.ts
│   └── useLocalizedImage.ts
│
├── contexts/
│   └── Providers.tsx       # App-wide provider tree
│
└── types/
    └── cards.ts            # CardEntry, Card, CardStack, CollectionStats
```

Feature modules follow the **feature > sub-feature > resource** pattern — see `docs/feature-modules.md`.

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
        ├── localStorage (mtg-snap-collection) — source of truth
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
