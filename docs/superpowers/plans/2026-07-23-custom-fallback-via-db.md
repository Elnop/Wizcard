# Custom Fallback Via DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `useCustomFallbackPrint` off a Scryfall prints-search onto a DB-first `getCardCollection([{oracle_id}])` call, preserving the "newest print" selection by sorting `catalog-db.resolveByOracleId`'s rows by `released_at` descending.

**Architecture:** Two surgical changes. (1) `catalog-db.resolveByOracleId` sorts the oracle's prints newest-first before `pickByLang` (on the already-filtered copy — no shared mutation). (2) `useCustomFallbackPrint` swaps `getCardPrints(search-uri)[0]` for `getCardCollection([{oracle_id}]).data[0]` (client-safe, via the DB-first route). Hook keying/abort/derivation unchanged.

**Tech Stack:** TypeScript, Next.js client hook, Supabase (via the DB-first `/api/scryfall/cards/collection` route). No test framework — verify via `npm run check` + runtime.

## Global Constraints

- **No test framework** — verify via tsc + eslint + dev-server runtime. Never write unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51 pre-existing problems). Gate on NO NEW problems via `npx eslint <changed files>`. (project memory)
- **`catalog-db` stays PURE** — no Scryfall import. `resolveByOracleId` change is a pure in-memory sort. (1a invariant)
- **`useCustomFallbackPrint` is a client hook** — it must call `getCardCollection` (client-safe, via `fetcher` → the route), NOT `card-source` / `@/lib/supabase/server` (server-only). (spec)
- **Preserve the hook's behavior**: `{ print, loading }` shape, result keying by `oracleId`, render-time derivation, abort-on-oracle-change, `enabled`/`canFetch` gating, `null`-when-not-found. Only the resolution call changes. (spec)
- **`released_at` is an ISO date string** (`YYYY-MM-DD`), so `b.localeCompare(a)` = newest first. (spec)
- **Local Supabase running, DB seeded** (159k prints EN+FR). SUPABASE_URL=http://127.0.0.1:54321. A lingering next-server may hold :3000 — use `PORT=<free>` for dev-server checks.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- Modify: `src/lib/card/catalog-db/index.ts` — `resolveByOracleId` sorts by `released_at` desc before `pickByLang`.
- Modify: `src/lib/scryfall/hooks/useCustomFallbackPrint.ts` — swap the import + the resolution call.

No new files.

---

## Task 1: Newest-print selection in `resolveByOracleId`

**Files:**

- Modify: `src/lib/card/catalog-db/index.ts` (`resolveByOracleId`, ~line 323)

**Interfaces:**

- Produces: `resolveByOracleId` returns the **newest** print of the oracle (in the requested language, else EN), for every `{oracle_id}` resolution in `byCollection`.

- [ ] **Step 1: Sort the filtered rows newest-first**

Replace the body of `resolveByOracleId`:

```ts
// before
const rows = ctx.prints.filter((p) => p.oracle_id === id.oracle_id);
const row = pickByLang(rows, lang);
return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;

// after
const rows = ctx.prints
	.filter((p) => p.oracle_id === id.oracle_id)
	.sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));
const row = pickByLang(rows, lang);
return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;
```

`.filter()` already returns a new array, so `.sort()` does not mutate the shared `ctx.prints`. `PrintRow` carries `released_at` (in `PRINT_COLS`) — no query change.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `npx eslint src/lib/card/catalog-db/index.ts` → no new problems. Confirm no Scryfall import was added (`grep -n "scryfall/endpoints" src/lib/card/catalog-db/index.ts` → empty).

- [ ] **Step 3: Runtime — {oracle_id} returns the newest print**

Start the dev server on a free port (kill lingering: `pkill -9 -f next-server`; then `PORT=3011 npm run dev`, wait for "Ready"). Pick a reprinted oracle and confirm the newest print comes back:

```bash
# get an oracle with many prints + its newest set
docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -d postgres -tAc \
  "select oracle_id from card_definitions where name='Lightning Bolt';"
# newest print's set for that oracle:
docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -d postgres -tAc \
  "select set, released_at from card_prints where oracle_id='<ORACLE>' and lang='en' order by released_at desc limit 1;"
# now resolve via the route and compare:
curl -s -X POST http://localhost:3011/api/scryfall/cards/collection \
  -H 'Content-Type: application/json' \
  -d '{"identifiers":[{"oracle_id":"<ORACLE>"}]}' | python3 -c 'import sys,json;c=json.load(sys.stdin)["data"][0];print(c["set"],c["released_at"])'
```

Expected: the route's returned `set`/`released_at` matches the newest-print query. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/catalog-db/index.ts
git commit -m "$(printf 'feat(catalog-db): resolveByOracleId returns the newest print\n\nSort the oracle\\047s prints by released_at desc (on the filtered copy, no shared\nmutation) before pickByLang, so an {oracle_id} resolution returns the most\nrecent print — matching the old order=released selection.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Migrate `useCustomFallbackPrint` to `getCardCollection`

**Files:**

- Modify: `src/lib/scryfall/hooks/useCustomFallbackPrint.ts`

**Interfaces:**

- Consumes: `getCardCollection(identifiers, signal?)` (client-safe, via the DB-first route).
- Produces: the hook resolves its fallback print DB-first; `{ print, loading }` shape and all keying/abort/derivation unchanged.

- [ ] **Step 1: Swap the import and the resolution call**

Change the import (line 4):

```ts
// before
import { getCardPrints } from '../endpoints/cards';
// after
import { getCardCollection } from '../endpoints/cards';
```

In the effect (~lines 44-51), remove the `const uri = …` search-URL line and replace the fetch + set:

```ts
// before
const uri = `https://api.scryfall.com/cards/search?q=oracle_id%3A${oracleId}&unique=prints&order=released`;
// ...
const prints = await getCardPrints(uri, controller.signal);
if (controller.signal.aborted) return;
setResult({ oracleId, print: prints[0] ?? null });

// after (no uri line)
const list = await getCardCollection([{ oracle_id: oracleId }], controller.signal);
if (controller.signal.aborted) return;
setResult({ oracleId, print: list.data[0] ?? null });
```

Everything else in the hook (the `useState` result keying, the `catch (err)` with AbortError handling, the `finally`, the render-time derivation `result?.oracleId === oracleId ? … : null`, the `canFetch`/`enabled` gating) is UNCHANGED.

> **Implementer note:** read the full effect first. The old `getCardPrints` THREW on error (caught by the existing `catch`, which sets `print: null`). `getCardCollection` does NOT throw for a not-found oracle — it returns a list with an empty `data`, so `list.data[0]` is `undefined` → `?? null` gives `null` (same result). The `catch` still handles real network errors and the AbortError branch. No extra null-guard needed here (unlike the G1 image hooks) because `?? null` already covers the empty case and the shape is `{print: null}` either way. Confirm the `uri` variable is fully removed (no unused-var lint).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `grep -n "getCardPrints\|cards/search" src/lib/scryfall/hooks/useCustomFallbackPrint.ts` → empty. `grep -n "supabase/server\|card/source" src/lib/scryfall/hooks/useCustomFallbackPrint.ts` → empty (client-safe). `npx eslint src/lib/scryfall/hooks/useCustomFallbackPrint.ts` → no new problems (no unused `uri`).

- [ ] **Step 3: Runtime**

Dev server (free port). Trigger the custom-card fallback path: a custom card whose image must fall back to an official print (e.g. a custom card with an ignored tag, or a broken custom image) that carries an `oracle_id`.

- Confirm the fallback image renders (the newest official print).
- Confirm in the dev log / network tab there is **no `api.scryfall.com/cards/search`** GET for that oracle — resolution goes to `POST /api/scryfall/cards/collection`.
- If you cannot easily reach the custom-fallback UI state, at minimum confirm tsc/eslint/grep clean and confirm via curl that `POST /api/scryfall/cards/collection` with `[{oracle_id: <a known oracle>}]` returns a print — describe what you could/couldn't drive; controller will cover the UI path.
  Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/hooks/useCustomFallbackPrint.ts
git commit -m "$(printf 'feat(scryfall): useCustomFallbackPrint resolves DB-first via getCardCollection\n\nSwap the oracle_id prints-search for getCardCollection([{oracle_id}]).data[0]\n(DB-first via the collection route; newest print per resolveByOracleId). Hook\nkeying/abort/derivation unchanged; empty result still yields print: null.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Final check

**Files:** none.

- [ ] **Step 1: Full project check**

Run: `npm run check` → no NEW problems beyond baseline. `npx eslint` clean on both changed files.

- [ ] **Step 2: Confirm campaign end-state**

Run: `grep -rn "getCardPrints" src/ | grep -v node_modules | grep -v "endpoints/cards.ts"`
Expected: only `useCardPrints.ts` (the prints tab — intentionally on Scryfall, G2 dropped) still calls `getCardPrints`. `useCustomFallbackPrint` no longer does.
Run: `grep -rn "getCardBySetNumberAndLang\|getCardPrints" src/ | grep -v node_modules | grep -v "card/source\|endpoints/cards.ts"`
Expected: only `useCardPrints.ts` remains (multilingual prints tab). Every other client card-data retrieval now goes through the DB-first route or card-source.

- [ ] **Step 3: No commit** (verification only). Sub-project 1b-G4 complete — the retrieval consolidation campaign is done.

---

## Self-Review

**Spec coverage:**

- resolveByOracleId newest-print sort → Task 1. ✔
- useCustomFallbackPrint → getCardCollection([{oracle_id}]).data[0] → Task 2. ✔
- Preserve hook shape/keying/abort/derivation; null-when-not-found → Task 2 (only the call changes; `?? null` covers empty). ✔
- catalog-db stays pure (in-memory sort, no Scryfall) → Task 1. ✔
- Client-safe (getCardCollection, not card-source) → Task 2. ✔
- Campaign end-state (only the multilingual prints tab stays on Scryfall) → Task 3 Step 2. ✔

**Placeholder scan:** No TBD/TODO. The `<ORACLE>` in Task 1 Step 3 is a runtime placeholder the implementer fills from the psql query shown immediately above it — a concrete lookup, not a spec gap.

**Type consistency:** `resolveByOracleId(ctx, id, lang)` signature unchanged (only its body). `getCardCollection([{oracle_id}], signal)` matches the signature threaded in G1 (identifiers + optional signal). `list.data[0] ?? null` matches the existing `setResult({ oracleId, print: … })` shape (`ScryfallCard | null`). `released_at` typed on `PrintRow` (string | null), so `?? ''` before `localeCompare` is sound.
