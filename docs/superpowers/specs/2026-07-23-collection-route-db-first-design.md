# Route the collection API through card-source (DB-first) — sub-project 1b-2

**Date**: 2026-07-23
**Status**: Design approved, ready for planning

## Context and goal

1a built the catalog read layer (`catalog-db` + `card-source`). 1b-1 extended
`catalog-db.byCollection` (and `card-source.getCardCollection`) to resolve `{id}`,
`{set, collector_number}`, and `{name}` identifiers from the DB with an intra-DB EN
fallback. But that improvement is **latent**: no consumer calls `card-source` yet — the
card page uses `getCardById` (1a), and everything batch-shaped still hits Scryfall.

This sub-project makes the batch path DB-first. Exploration showed the migration is far
smaller than "migrate N consumers": **all client card-batch traffic funnels through one
API route**, `POST /api/scryfall/cards/collection`, via the client `fetcher`
(`src/lib/scryfall/utils/fetcher.ts` rewrites `/cards/*` to `/api/scryfall/*`). The
consumers (`useImportPreviewFetch`, `useResolveDeckList`, `useEdhrecRecommendations`,
`resolveCardsByScryfallIds`, `hydrateAllParts`, deck/collection/token hooks) all reach
Scryfall's `/cards/collection` **through this one route**.

So the entire batch path becomes DB-first by **rewiring that single route** to call
`card-source.getCardCollection` instead of proxying to `api.scryfall.com`. No consumer
changes.

## Why the route, not the consumers (client/server boundary)

`card-source` → `catalog-db` → `@/lib/supabase/server` (the Next server client, which
reads cookies via `next/headers`). A **client** hook cannot import `card-source` — it
would pull the server client into the client bundle and break. Several consumers are
client hooks (`useEdhrecRecommendations`, `useCardEntryForm`, `useLocalizedImage`), and
the "server-looking" modules (`resolveCardsByScryfallIds`, `hydrateAllParts`) are in fact
used by client hooks and reach Scryfall via `fetcher` → the API route too.

The API route is server-side, so it **can** import `card-source`. Rewiring it is the
correct seam: the DB-first logic runs on the server, clients keep calling the same route
with the same request/response shape.

## Design

**The single change**: in `src/app/api/scryfall/cards/collection/route.ts`, replace the
outbound `fetch('https://api.scryfall.com/cards/collection', …)` + its response handling
with a call to `card-source.getCardCollection(identifiers)`, returning its
`ScryfallList<ScryfallCard>` as the JSON response.

```
client consumers (import, edhrec, deck resolution, collection, tokens)
    │  scryfallPost('/cards/collection', { identifiers })  via fetcher
    ▼
POST /api/scryfall/cards/collection   ← THE rewired point
    │  before: fetch api.scryfall.com/cards/collection
    │  after:  card-source.getCardCollection(identifiers)   (DB-first + Scryfall fallback)
    ▼
card-source → catalog-db (DB) → miss → scryfall/endpoints (fallback, still ≤75)
```

**Preserved (unchanged behavior):**

- **`MAX_IDENTIFIERS = 75`** and all anti-abuse guards (content-length / body-size checks,
  `{ identifiers: object[] }` shape validation, the 1..75 count check). The clients already
  batch by 75; keeping the cap means zero client change and keeps the Scryfall fallback
  within Scryfall's own 75-identifier limit.
- **Response shape**: the route returns the same `{ object:'list', has_more, data,
not_found? }` shape. `card-source.getCardCollection` already produces it, including
  `not_found` — which `useImportPreviewFetch` reads (`listResult.not_found ?? []`), so that
  must survive.
- **Error semantics**: today a Scryfall non-OK response is passed through with its status.
  With DB-first, hard errors now come only from the Scryfall fallback (or an unexpected DB
  failure). The route must still return a sane error response (e.g. 502/500) rather than
  throwing, so a failing batch degrades the same way it does today (its cards land in
  `not_found` / the caller's unresolved path).
- **Consumers**: no change. Import, edhrec, deck resolution, collection, tokens all keep
  calling the route as-is and transparently become DB-first.

**Result**: one route change turns the whole client batch path DB-first. Catalog cards
resolve from the DB (zero Scryfall calls); only cards absent from the catalog (non-paper,
a set newer than the last re-seed) fall back to Scryfall, batched ≤75.

## Scope

**In scope**

- Rewire `src/app/api/scryfall/cards/collection/route.ts` to call
  `card-source.getCardCollection` instead of proxying to Scryfall.
- Keep the 75-cap, anti-abuse guards, response shape (incl. `not_found`), and graceful
  error handling.

**Out of scope (later)**

- Formal intent functions (`resolveByIds`, `resolveByNames`, `getLocalized`,
  `hydrateParts`) — a later 1b spec.
- Removing the two-step token localization (`localizeTokens` / `useDeckTokens` /
  `useCardTokens`) via a language-aware `getLocalized` — a later 1b spec.
- The other Scryfall proxy routes (`/cards/{id}`, `/cards/{set}/{num}/{lang}`, search) —
  migratable the same way later; search stays on Scryfall regardless.
- Raising `MAX_IDENTIFIERS` above 75 — deferred (would require re-chunking the Scryfall
  fallback and wider client batching).

## Verification

No test framework (project convention) — verify via `npm run check` + runtime:

- **Route unit-of-behavior via dev server**: POST `/api/scryfall/cards/collection` with a
  batch of `{id}` / `{set,collector_number}` / `{name}` identifiers for known catalog
  cards → 200 with a `data` array of the right cards, and **no `api.scryfall.com/cards`
  call** in the dev-server log for catalog cards. A batch including an identifier absent
  from the catalog → that card comes back via the Scryfall fallback (one ≤75 Scryfall
  call), or lands in `not_found` if Scryfall can't resolve it either.
- **not_found preserved**: a batch with a genuinely-bogus identifier returns it in
  `not_found`, and `useImportPreviewFetch`'s "not found" table still populates.
- **End-to-end consumer check**: run a deck import (the biggest consumer) against a
  catalog-covered list → cards resolve, far fewer/zero Scryfall calls than before; a list
  with an unknown card still resolves the rest and reports the unknown.
- **Guards intact**: a >75 batch is rejected 400/413 as before; an oversized body is
  rejected; malformed JSON is rejected.
- `npm run check`: no NEW problems in the changed file; tsc clean.
