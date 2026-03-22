# Scryfall Integration

Scryfall provides all card data: names, images, oracle text, prices, set info, etc. The API is free, requires no authentication, and imposes a 100ms rate limit.

## Key Files

- `src/lib/scryfall/fetcher.ts` — all HTTP calls go through here
- `src/lib/scryfall/rate-limiter.ts` — enforces 100ms between requests
- `src/lib/scryfall/cache.ts` — in-memory TTL cache
- `src/lib/card-cache.ts` — IndexedDB persistent cache
- `src/lib/scryfall/scryfall-query.ts` — query builder
- `src/lib/scryfall/endpoints/` — typed API functions

## HTTP Layer (`fetcher.ts`)

All Scryfall requests must go through `scryfallGet()` or `scryfallPost()`. Never call `fetch()` directly against Scryfall.

```typescript
import { scryfallGet, scryfallPost } from '@/lib/scryfall/fetcher';

const card = await scryfallGet<ScryfallCard>('/cards/named?exact=Lightning+Bolt');
const result = await scryfallPost<ScryfallCardCollection>('/cards/collection', { identifiers });
```

The fetcher provides:

1. **Rate limiting** — 100ms sequential delay via a promise chain (never parallel)
2. **In-memory cache** — TTL-based, 5 minute expiry, 1000 entry max
3. **In-flight deduplication** — identical concurrent requests share one network call
4. **Retry logic** — retries on transient errors

## Two-Layer Card Cache

Card objects are cached in two places:

| Layer     | Location                    | TTL   | Purpose                                   |
| --------- | --------------------------- | ----- | ----------------------------------------- |
| In-memory | `src/lib/scryfall/cache.ts` | 5 min | API response caching                      |
| IndexedDB | `src/lib/card-cache.ts`     | 24h   | `ScryfallCard` objects for the collection |

The IndexedDB cache (`card-cache.ts`) is used by `useCollectionCards` to avoid re-fetching card data on every page load. Cards are stored by `scryfallId` with a timestamp for TTL validation.

## Query Builder (`scryfall-query.ts`)

`buildScryfallQuery()` converts a structured search parameters object into a Scryfall full-text search query string.

```typescript
import { buildScryfallQuery } from '@/lib/scryfall/scryfall-query';

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

| Hook                    | Description                                 |
| ----------------------- | ------------------------------------------- |
| `useScryfallCardSearch` | Infinite-scroll search with filter params   |
| `useSets`               | Fetches and caches all sets                 |
| `useSymbology`          | Fetches mana symbol SVGs                    |
| `useCardPrints`         | Fetches all printings for a given oracle ID |

## Rate Limit Compliance

The Scryfall API asks for a maximum of 10 requests/second (100ms between requests). The rate limiter serializes all requests into a chain — even if multiple components trigger requests simultaneously, they are sent one at a time with 100ms gaps.
