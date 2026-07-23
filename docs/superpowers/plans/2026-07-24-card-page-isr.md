# Card Page ISR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public card page ISR (statically generated on demand, cached 7 days) by giving `catalog-db` a cookieless anon Supabase client (so the official-card render path stops reading cookies and can be statically cached), and adding ISR config to the card page.

**Architecture:** New `createCatalogClient()` (anon, no `next/headers`) replaces the cookie server client in `catalog-db`'s 7 read sites AND in the custom-card read path — safe because both are read under public-read RLS. The card page then reads NO cookies on any branch (official cards via catalog-db; public custom cards via the same cookieless client, with private ones filtered out by RLS when `auth.uid()` is null → `notFound`). It gets `revalidate = 604800`, `dynamicParams = true`, `generateStaticParams → []`, so the whole route is ISR.

**Tech Stack:** Next.js 16 (App Router, ISR), TypeScript, `@supabase/supabase-js` (anon client). No test framework — verify via `npm run check` + build/runtime.

## Global Constraints

- **No test framework** — verify via tsc + eslint + `npm run build` output + dev-server runtime. Never write unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51 pre-existing problems). Gate on NO NEW problems via `npx eslint <changed files>`. (project memory)
- **The cookieless client is anon + public-read only** — it reads ONLY the 5 catalog tables (all RLS `select using(true)` + grant anon). It must NOT be used for any user-scoped data. (spec — verified catalog-db reads only catalog tables)
- **`createClient` (server + cookies) stays the default** everywhere else in the app (user data). Only `catalog-db` switches to cookieless. (spec)
- **Do not break the `/cards/collection` route or card-source callers** — they call the same `catalog-db`; the cookieless client must resolve the same results. (spec)
- **Local Supabase running, DB seeded** (159k prints EN+FR, 1047 sets). `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the anon creds the client uses (already in env — the browser client `src/lib/supabase/client.ts` uses them). A lingering next-server may hold :3000 — use `PORT=<free>` for dev checks.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- Create: `src/lib/supabase/catalog.ts` — `createCatalogClient()` cookieless anon singleton.
- Modify: `src/lib/card/catalog-db/index.ts` — swap the import + the 7 `await createClient()` sites.
- Modify: `src/lib/supabase/queries/custom-cards.server.ts` — swap the 2 custom-card reads to
  the cookieless client (public custom cards only; removes the last cookie read on the page).
- Modify: `src/app/[locale]/card/[id]/page.tsx` — add `revalidate`, `dynamicParams`, `generateStaticParams`.

No migration, no seed change.

---

## Task 1: Cookieless catalog client

**Files:**

- Create: `src/lib/supabase/catalog.ts`

**Interfaces:**

- Produces: `createCatalogClient()` — returns a `@supabase/supabase-js` `SupabaseClient` built from the public anon creds, no cookies, module-level singleton.

- [ ] **Step 1: Write the client**

```ts
// Cookieless anon Supabase client for reading the PUBLIC catalog (card_definitions,
// card_prints, card_definition_faces, card_print_faces, card_sets — all RLS public-read).
// Unlike @/lib/supabase/server, it never touches next/headers/cookies, so a route that
// reads the catalog through it can be statically generated (ISR). Never use it for
// user-scoped data.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function createCatalogClient(): SupabaseClient {
	if (!_client) {
		_client = createClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{ auth: { persistSession: false, autoRefreshToken: false } }
		);
	}
	return _client;
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `npx eslint src/lib/supabase/catalog.ts` → clean. Confirm no `next/headers` import (`grep -n "next/headers\|cookies" src/lib/supabase/catalog.ts` → empty).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/catalog.ts
git commit -m "$(printf 'feat(supabase): cookieless anon catalog client for static reads\n\ncreateCatalogClient reads the public-read catalog with no next/headers/cookies,\nso a route reading the catalog through it can be statically generated (ISR).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: `catalog-db` uses the cookieless client

**Files:**

- Modify: `src/lib/card/catalog-db/index.ts`

**Interfaces:**

- Consumes: `createCatalogClient` (Task 1).
- Produces: `catalog-db` reads the catalog without cookies; all lookups (`byId`, `bySetNumberLang`, `bySetNumber`, `byName`, `byExternalId`, `byMultiverseId`, `byCollection`, `printsByOracleId`) return identical results.

- [ ] **Step 1: Swap the import and the 7 client sites**

Change the import (line 4):

```ts
// before
import { createClient } from '@/lib/supabase/server';
// after
import { createCatalogClient } from '@/lib/supabase/catalog';
```

Replace all 7 `const sb = await createClient();` occurrences (lines ~80, 89, 110, 132, 141, 364, 393) with:

```ts
const sb = createCatalogClient();
```

Note: `createCatalogClient()` is **synchronous** (no `await cookies()`), so drop the `await`. The `SB` type alias at the top of the file (`type SB = Awaited<ReturnType<typeof createClient>>`) must be updated to the new client type:

```ts
// before
type SB = Awaited<ReturnType<typeof createClient>>;
// after
type SB = ReturnType<typeof createCatalogClient>;
```

> **Implementer note:** after the edit, `grep -n "createClient\|await createClient" src/lib/card/catalog-db/index.ts` must show NO `@/lib/supabase/server` `createClient` usage and no leftover `await createClient()`. The 7 sites all become `createCatalogClient()` (no await). The `SB` type alias feeds `assemblePrints(sb: SB, …)` and `firstPrintCard(sb, …)` — updating it to `ReturnType<typeof createCatalogClient>` keeps those signatures valid (both clients are `SupabaseClient`, so the `.from(...).select(...)` calls are unchanged).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `npx eslint src/lib/card/catalog-db/index.ts` → no new problems. Confirm: `grep -n "supabase/server" src/lib/card/catalog-db/index.ts` → empty; `grep -c "createCatalogClient()" src/lib/card/catalog-db/index.ts` → 7.

- [ ] **Step 3: Runtime — catalog-db still resolves (via the route)**

Start a dev server on a free port (`pkill -9 -f next-server`; `PORT=3013 npm run dev`; wait for "Ready" — note: it may bind a different port if 3013 is taken; check the log for the actual `Local: http://localhost:PORT`). Then confirm the `/cards/collection` route (which calls catalog-db) still resolves with the cookieless client:

```bash
curl -s -X POST http://localhost:<PORT>/api/scryfall/cards/collection \
  -H 'Content-Type: application/json' \
  -d '{"identifiers":[{"set":"dsk","collector_number":"1"},{"set":"dsk","collector_number":"1","lang":"fr"}]}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print([(c["lang"],c.get("printed_name")) for c in d["data"]])'
```

Expected: two cards resolve (en + fr "Cheerleader acrobatique") — same as before, proving the cookieless client reads the catalog. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/catalog-db/index.ts
git commit -m "$(printf 'feat(catalog-db): read via the cookieless catalog client\n\nSwap the cookie server client for createCatalogClient (anon, no next/headers)\nat all 7 read sites. Catalog is public-read so this is safe; resolution logic\nunchanged. Removes the cookie read that force-dynamic\047d any route reading the\ncatalog — the prerequisite for card-page ISR.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2b: Custom-card read path goes cookieless (public cards only)

**Files:**

- Modify: `src/lib/supabase/queries/custom-cards.server.ts`

**Interfaces:**

- Consumes: `createCatalogClient` (Task 1).
- Produces: `fetchCustomCardRowById` / `fetchCustomCardSourceRowById` read via the cookieless
  client. Under RLS `using (is_public = true or created_by = auth.uid())` with `auth.uid()` =
  null, only PUBLIC custom cards resolve; a private one returns null → the page `notFound()`s.
  This removes the last cookie read from the card page.

Context: `getCustomCardWithSource` (which calls these) is used ONLY by the card page
(`page.tsx`, 2 sites) — verified — so this swap affects nothing else. The editor/collection
read their own private custom cards via different paths that keep the cookie client.

- [ ] **Step 1: Swap the client in both functions**

In `src/lib/supabase/queries/custom-cards.server.ts`, change the import and both `await
createServerClient()` calls:

```ts
// before
import { createClient as createServerClient } from '@/lib/supabase/server';
// ...
const client = await createServerClient(); // (in both functions)

// after
import { createCatalogClient } from '@/lib/supabase/catalog';
// ...
const client = createCatalogClient(); // (in both functions, no await)
```

The `.from('custom_cards')`/`.from('custom_card_sources')` queries are UNCHANGED — the RLS
public-read term (`is_public = true`) does the filtering when `auth.uid()` is null. The
`.eq('id', id).not('oracle_id','is',null).single()` logic stays; a private card simply yields
no row (→ `null`, same as the existing not-found path).

> **Implementer note:** the file is named `*.server.ts` but it no longer needs the server
> (cookie) client — it now uses the cookieless catalog client. Leave the filename as-is
> (renaming ripples imports); the client swap is the only change. Confirm no other caller
> depends on these functions seeing the caller's private cards: `grep -rn
"fetchCustomCardRowById\|fetchCustomCardSourceRowById\|getCustomCardWithSource" src/ | grep
-v node_modules` shows only the card page path.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `npx eslint src/lib/supabase/queries/custom-cards.server.ts` →
no new problems. Confirm no `supabase/server` import left in this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/custom-cards.server.ts
git commit -m "$(printf 'feat(mpc): custom-card page reads go cookieless (public cards only)\n\nfetchCustomCardRowById/SourceRowById use createCatalogClient. Under RLS\n(is_public OR created_by=auth.uid()) with auth.uid() null, only public custom\ncards resolve; private ones -> null -> the page notFounds. Removes the last\ncookie read from the card page (used only there), making the whole route ISR.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Enable ISR on the card page

**Files:**

- Modify: `src/app/[locale]/card/[id]/page.tsx`

**Interfaces:**

- Consumes: `getCardById` (now reads via the cookieless catalog-db).
- Produces: the official card page is statically generated on demand and cached; the `mpc:` branch stays dynamic.

- [ ] **Step 1: Add the ISR exports**

At the top of `src/app/[locale]/card/[id]/page.tsx` (after the imports, before `interface CardPageProps`), add:

```ts
// ISR: the public card page is static catalog data. Generate each card on first
// access and cache it (revalidate 7 days). The mpc: branch reads cookies (owner-gated
// custom cards), which keeps those specific renders dynamic — official cards cache.
export const revalidate = 604800; // 7 days
export const dynamicParams = true;

export async function generateStaticParams() {
	return []; // 159k prints × 2 locales is too many to build; everything is on-demand ISR
}
```

No other change to the page body — the `getCardById` path is now cookieless (Task 2), and the `mpc:` branch is unchanged (still reads cookies, still dynamic for those ids).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `npx eslint "src/app/[locale]/card/[id]/page.tsx"` → no new problems.

- [ ] **Step 3: Build — confirm the page is ISR, not force-dynamic**

Run: `npm run build` (this needs the DB reachable for any generateStaticParams work — ours returns `[]`, so it should not query at build). In the build output route table, find `/[locale]/card/[id]`. Expected: it is marked as ISR / revalidate (e.g. `● (ISR)` or shows a revalidate value / `◐`), NOT `ƒ (Dynamic)`.

> **Implementer note:** after Tasks 2 and 2b, NEITHER branch reads cookies — the official
> path uses the cookieless catalog client, and the `mpc:` path now does too (Task 2b). So the
> whole route should statically generate. Verify the build marks `/[locale]/card/[id]` as ISR
> (a revalidate value / `● (ISR)` / `◐`), NOT `ƒ (Dynamic)`. If it still shows `ƒ (Dynamic)`,
> something is still reading a dynamic API (cookies/headers) on the render path — STOP and
> report which (grep the page's transitive imports for `next/headers`); the force-dynamic
> risk from the old cookie-reading mpc branch is gone, so a remaining `ƒ` means an unexpected
> dynamic read to hunt down, not an accepted tradeoff. Report the build marking verbatim.

- [ ] **Step 4: Runtime — cache HIT on second request + correct render**

Start a dev server (free port). Request an official card page twice and check caching + correctness:

```bash
# get a valid catalog print id
docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -d postgres -tAc \
  "select id from card_prints where set='dsk' and collector_number='1' and lang='en';"
# first request (generates), second (should be cached)
curl -s -o /dev/null -w "1st: %{http_code} %{time_total}s\n" "http://localhost:<PORT>/en/card/<ID>"
curl -s -o /dev/null -w "2nd: %{http_code} %{time_total}s\n" "http://localhost:<PORT>/en/card/<ID>"
# the rendered page has the card name
curl -s "http://localhost:<PORT>/en/card/<ID>" | grep -o "<title>[^<]*</title>" | head -1
```

Expected: both 200; the page renders the card name in `<title>`. (In dev, ISR caching is limited — the definitive cache proof is the `npm run build` route marking in Step 3. In production/build, the second request would be a cache HIT.) Also request an `mpc:` id if one exists in the local DB to confirm it still renders. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/card/[id]/page.tsx"
git commit -m "$(printf 'feat(card): card page is ISR (static on demand, revalidate 7d)\n\ngenerateStaticParams returns [] (too many prints to build); each official card\nis generated statically on first access and cached 7 days, served without a DB\nquery afterwards. The mpc: branch reads cookies and stays dynamic (owner-gated).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Final check

**Files:** none.

- [ ] **Step 1: Full project check**

Run: `npm run check` → no NEW problems beyond baseline. `npx eslint` clean on all 3 changed files.

- [ ] **Step 2: Confirm the build route marking**

Re-confirm from Task 3 Step 3 that `/[locale]/card/[id]` is ISR (not force-dynamic) in the `npm run build` output. This is the definitive proof the card page will cache in production. Record the marking.

- [ ] **Step 3: Confirm no user-data regression**

The cookieless client is only in `catalog-db` (catalog tables). Confirm no other module started using `createCatalogClient` for user data: `grep -rn "createCatalogClient" src/ | grep -v node_modules` → only `catalog.ts` (definition) and `catalog-db/index.ts` (the 7 catalog reads). The app's user-data paths still use `@/lib/supabase/server`.

- [ ] **Step 4: No commit** (verification only). Sub-project 3 complete.

---

## Self-Review

**Spec coverage:**

- `createCatalogClient()` cookieless anon → Task 1. ✔
- catalog-db uses it (7 sites + SB type) → Task 2. ✔
- ISR config on the card page (revalidate 604800, dynamicParams, generateStaticParams → []) → Task 3. ✔
- MPC branch stays dynamic (unchanged; reads cookies) + the whole-route-dynamic risk verified at build → Task 3 Step 3 note + Task 4 Step 2. ✔
- No user-data leak to the cookieless client → Task 4 Step 3. ✔
- Out of scope (sub-project 2, other public pages, on-demand revalidation) → not touched. ✔

**Placeholder scan:** No TBD/TODO. The `<PORT>`/`<ID>` in runtime steps are values the
implementer fills from the commands shown immediately above them. The Task 3 build-marking
"STOP and report if force-dynamic" is a real risk gate with a concrete diagnostic (the build
route table), not a placeholder — and the remedy is bounded (report, don't improvise).

**Type consistency:** `createCatalogClient(): SupabaseClient` (Task 1) matches the `SB` type
alias update and the 7 call sites in Task 2 (`const sb = createCatalogClient()`, no await).
`assemblePrints(sb: SB, …)` / `firstPrintCard(sb, …)` keep working because both clients are
`SupabaseClient`. `getCardById` (page) is unchanged — only its transitive client changes.
