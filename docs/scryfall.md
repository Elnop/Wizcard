# Scryfall Integration

Scryfall provides all card data: names, images, oracle text, prices, set info, etc. The API is free, requires no authentication, and imposes a 100ms rate limit.

## Directory Structure

```
src/lib/scryfall/
├── store/
│   └── scryfall-store.ts
├── hooks/
│   ├── useScryfallSets.ts
│   ├── useScryfallSymbols.ts
│   ├── useScryfallCardSearch.ts
│   └── useCardPrints.ts
├── endpoints/
│   ├── cards.ts
│   ├── sets.ts
│   ├── symbols.ts
│   └── bulk-data.ts
├── types/
│   └── scryfall.ts
└── utils/
    ├── fetcher.ts
    ├── rate-limiter.ts
    ├── cache.ts
    ├── errors.ts
    └── scryfall-query.ts
```

## HTTP Layer (`utils/fetcher.ts`)

All Scryfall requests must go through `scryfallGet()` or `scryfallPost()`. Never call `fetch()` directly against Scryfall.

```typescript
import { scryfallGet, scryfallPost } from '@/lib/scryfall/utils/fetcher';

const card = await scryfallGet<ScryfallCard>('/cards/named?exact=Lightning+Bolt');
const result = await scryfallPost<ScryfallCardCollection>('/cards/collection', { identifiers });

// Optional AbortSignal for cancellation:
const card = await scryfallGet<ScryfallCard>('/cards/named?exact=Bolt', signal);
```

The fetcher provides:

1. **Rate limiting** — 100ms sequential delay via a promise chain (never parallel)
2. **In-memory cache** — TTL-based, 5 minute expiry, 1000 entry max
3. **In-flight deduplication** — identical concurrent requests share one network call
4. **Retry logic** — retries on transient errors
5. **AbortSignal support** — pass an optional `AbortSignal` to cancel in-flight requests

## Store (`store/scryfall-store.ts`)

The Zustand store caches sets and symbols across the app with TTL-based invalidation and `localStorage` persistence.

```typescript
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';
```

| Data    | TTL | Storage key      |
| ------- | --- | ---------------- |
| sets    | 1h  | `scryfall-store` |
| symbols | 24h | `scryfall-store` |

Both `fetchSets` and `fetchSymbols` are no-ops if the cached data is still within TTL — no network call is made. The persisted state (`sets`, `symbols`, `setsLoadedAt`, `symbolsLoadedAt`) survives page reloads via `localStorage`.

State shape:

```typescript
type ScryfallStoreState = {
	sets: ScryfallSet[];
	symbols: Record<string, ScryfallCardSymbol>;
	setsLoadedAt: number | null;
	symbolsLoadedAt: number | null;
	isLoadingSets: boolean;
	isLoadingSymbols: boolean;
	setsError: string | null;
	symbolsError: string | null;
};
```

## Two-Layer Card Cache

Card objects are cached in two places:

| Layer     | Location                          | TTL   | Purpose                                   |
| --------- | --------------------------------- | ----- | ----------------------------------------- |
| In-memory | `src/lib/scryfall/utils/cache.ts` | 5 min | API response caching                      |
| IndexedDB | `src/lib/card-cache.ts`           | 24h   | `ScryfallCard` objects for the collection |

The IndexedDB cache (`card-cache.ts`) is used by `useCollectionCards` to avoid re-fetching card data on every page load. Cards are stored by `scryfallId` with a timestamp for TTL validation.

## Query Builder (`utils/scryfall-query.ts`)

`buildScryfallQuery()` converts a structured search parameters object into a Scryfall full-text search query string.

```typescript
import { buildScryfallQuery } from '@/lib/scryfall/utils/scryfall-query';

const query = buildScryfallQuery({
	name: 'bolt',
	colors: ['R'],
	type: 'instant',
	set: 'lea',
	rarities: ['uncommon', 'rare'],
});
// → 'bolt color:R type:instant set:lea (rarity:uncommon OR rarity:rare)'
```

## Available Endpoints (`src/lib/scryfall/endpoints/`)

| File           | Functions                                                          |
| -------------- | ------------------------------------------------------------------ |
| `cards.ts`     | `searchCards`, `getCardById`, `getCardByName`, `getCardCollection` |
| `sets.ts`      | `getSets`, `getSetByCode`                                          |
| `symbols.ts`   | `getSymbology`                                                     |
| `bulk-data.ts` | `getBulkDataList`, `getBulkDataFile`                               |

## Image URIs

For **single-faced cards**:

```typescript
card.image_uris?.normal; // standard display
card.image_uris?.small; // thumbnail
card.image_uris?.large; // full resolution
```

For **double-faced cards** (DFCs — transform, modal, etc.), `image_uris` is null. Use `card_faces` instead:

```typescript
card.card_faces?.[0].image_uris?.normal; // front face
card.card_faces?.[1].image_uris?.normal; // back face
```

The `getLocalizedImage()` helper in `src/hooks/useLocalizedImage.ts` handles this branching and also selects the correct localized image when available.

## React Hooks (`src/lib/scryfall/hooks/`)

| Hook                    | Description                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `useScryfallCardSearch` | Infinite-scroll search with filter params                                                                                                       |
| `useScryfallSets`       | Reads sets from the store; triggers a fetch if data is stale or absent                                                                          |
| `useScryfallSymbols`    | Reads symbols from the store; triggers a fetch if data is stale or absent                                                                       |
| `useCardPrints`         | Fetches all printings for a given oracle ID; uses `AbortController` to cancel in-flight requests when the URI changes or the component unmounts |

`useScryfallSets` and `useScryfallSymbols` delegate all network logic to the store. They call `fetchSets`/`fetchSymbols` on mount, but those actions are no-ops when cached data is still fresh.

```typescript
// Sets
const { sets, isLoading, error } = useScryfallSets();

// Symbols — returns Record<string, ScryfallCardSymbol>
const symbols = useScryfallSymbols();
```

## Rate Limit Compliance

The Scryfall API asks for a maximum of 10 requests/second (100ms between requests). The rate limiter serializes all requests into a chain — even if multiple components trigger requests simultaneously, they are sent one at a time with 100ms gaps.

## Testability

- `utils/fetcher.ts` accepts an optional `AbortSignal`, making it straightforward to test cancellation behaviour without relying on timers.
- The Zustand store (`useScryfallStore`) can be reset between tests using `useScryfallStore.setState(initialState)` or mocked wholesale by replacing store selectors.
