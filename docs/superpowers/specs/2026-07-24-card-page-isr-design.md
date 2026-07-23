# Card page ISR (static generation on demand) — sub-project 3

**Date**: 2026-07-24
**Status**: Design approved, ready for planning

## Context and goal

The original objective of this whole effort was to pre-render card pages server-side and
stop depending on the live Scryfall API. Sub-projects 0–1b built the foundation: the
catalog lives in the DB, and the card page (`src/app/[locale]/card/[id]/page.tsx`) already
reads it via `card-source` (DB-first). But the page is still **SSR on every request** — no
`generateStaticParams`, no `revalidate`, no caching — so every visit re-queries the DB.

This sub-project makes the **public** card page **ISR** (Incremental Static Regeneration):
each card is rendered statically on its first visit, cached, and served as static HTML
afterwards (zero DB/Scryfall at render), with new cards handled on demand automatically.

## Why the page isn't static today (the one blocker)

`getCardById` → `card-source` → `catalog-db` → `@/lib/supabase/server` `createClient()`,
which does `await cookies()` (`next/headers`). **Reading cookies opts a route out of
static rendering** — Next forces it dynamic. That's the only thing preventing ISR: the
catalog data itself is public (RLS `select using (true)` + `grant select` to anon), so no
cookies/auth are needed to read it.

Verified: a plain anon Supabase client (no cookies, no session) reads
`card_prints`/`card_definitions`/`card_sets` fine (RLS public-read). And `catalog-db` only
ever reads the 5 catalog tables (`card_definitions`, `card_prints`, `card_definition_faces`,
`card_print_faces`, `card_sets`) — all public-read — so it never depends on the user's auth
context. Making it cookieless is safe.

## Why a long cache does NOT conflict with owner updates

The card page is **shell (server) + islands (client)**: the server component renders only
the card's catalog identity (name, image, oracle, prints — immutable, not per-user), while
everything mutable/personalized is in `'use client'` islands (`AddToCollectionButton` reads
`useCollectionContext`; `PrintsTab` reads collection copies). Verified: every component that
touches collection/deck/"owned"/quantity is `'use client'`.

ISR caches **only the server-rendered HTML** (the immutable catalog shell). The client
islands **hydrate on every page load in the visitor's browser** — they are never frozen by
the cache. So an owner editing their collection sees the change immediately
(`AddToCollectionButton` reflects the live client context), regardless of the cached HTML's
age. A long `revalidate` is safe precisely because nothing per-user is in the cached HTML.

## Design

### 1. Cookieless catalog client — `createCatalogClient()`

New `src/lib/supabase/catalog.ts`: a `@supabase/supabase-js` client built from the anon
key with `persistSession: false` and **no `next/headers`** — a module-level singleton
reusable across requests. It reads the public-read catalog without touching cookies, so a
route using it can be statically generated.

### 2. `catalog-db` becomes cookieless

Replace the 7 `await createClient()` (server + cookies) sites in
`src/lib/card/catalog-db/index.ts` with `createCatalogClient()`. This is safe and correct:
the catalog is always public-read, so catalog reads never need cookies. The resolution
logic (`byId`/`byCollection`/`printsByOracleId`/the assembler) is unchanged and stays shared
between the server path and the `/cards/collection` route — only the underlying Supabase
client changes from cookie-bound to cookieless. `createClient` (server + cookies) stays the
default everywhere else in the app (user data).

### 3. Enable ISR on the card page

In `src/app/[locale]/card/[id]/page.tsx`:

```ts
export const revalidate = 604800; // 7 days — catalog identity is ~immutable
export const dynamicParams = true; // ids not pre-generated are generated on demand
export async function generateStaticParams() {
	return []; // nothing at build; everything on demand (ISR)
}
```

`generateStaticParams` returns `[]` (159k prints × 2 locales is far too many to build), so
no page is built ahead of time; each is generated statically on first access and cached for
7 days. With `catalog-db` cookieless (change 2), the official-card render path no longer
reads cookies, so Next can statically cache it.

### 4. The MPC (custom card) branch stays dynamic

The page also handles `id.startsWith('mpc:')` → `getCustomCardWithSource`, which reads via
the **cookie-bound server client** (`fetchCustomCardRowById` imports
`@/lib/supabase/server`), and `custom_cards` RLS is owner/visibility-gated (not purely
public). So the `mpc:` branch **cannot** be statically cached the same way — it depends on
auth/cookies. `dynamicParams = true` already generates any non-pre-generated id on demand;
the `mpc:` branch reading cookies makes those specific renders dynamic (uncached), which is
correct — custom cards are per-user. Only official (catalog) card pages become ISR-cached.
No special handling needed beyond documenting this: the cookie read in the `mpc:` path
naturally keeps those responses dynamic, while the official path (now cookieless) caches.

> Implementation note: confirm at plan time that Next does not error on mixing a static
> `revalidate` with a request that reads cookies in one branch. If Next treats the whole
> route as dynamic because ONE branch can read cookies, the official path won't cache —
> in that case the fix is to move the cookie read out of the shared render path (e.g. the
> `mpc:` branch fetches its custom card in a way that only reads cookies when the id is
> actually `mpc:`). The plan verifies the official path caches (see Verification).

## Scope

**In scope**

- `createCatalogClient()` cookieless anon client (`src/lib/supabase/catalog.ts`).
- `catalog-db` uses it (7 sites) instead of the cookie server client.
- ISR config on the card page (`revalidate = 604800`, `dynamicParams`, `generateStaticParams → []`).

**Out of scope (later)**

- Sub-project 2 (freshness / re-seed) and on-demand revalidation (`revalidatePath`) tied to
  a re-seed — the 7-day `revalidate` is the interim freshness bound.
- Static generation of other public pages (sets, public decks) — migratable the same way.
- The `mpc:` custom-card branch staying dynamic (it must — per-user data).

## Verification

No test framework (project convention) — verify via `npm run check` + runtime + build:

- **Cookieless read works**: `createCatalogClient()` reads a known card (dsk/1) — already
  confirmed a plain anon client reads the catalog under RLS public-read.
- **The official card page is statically cached**: `npm run build` (or dev with cache
  headers) shows `/[locale]/card/[id]` as ISR/static (not `ƒ` dynamic) in the build output,
  OR at runtime the page renders without a per-request DB query after the first hit
  (second request served from cache — check the dev log for absence of a repeat catalog
  query / the `x-nextjs-cache` header = HIT). A catalog card renders correctly (name, image,
  tabs) from the cookieless path.
- **No regression for non-catalog / mpc**: an `mpc:` card page still renders (dynamically),
  reading its owner-gated custom card; the official path does not accidentally leak into the
  `mpc:` dynamic behavior (the official path caches).
- **Owner-update independence**: with a card page cached, adding the card to the collection
  (client island) still updates the button state immediately (the cached HTML is unaffected).
- **catalog-db still works everywhere**: the `/cards/collection` route and card-source
  callers resolve correctly with the cookieless client (spot-check a batch).
- `npm run check`: no NEW problems in changed files; tsc clean.
