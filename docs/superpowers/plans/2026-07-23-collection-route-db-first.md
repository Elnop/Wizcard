# DB-First Collection Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire `POST /api/scryfall/cards/collection` to resolve identifiers through `card-source.getCardCollection` (DB-first + Scryfall fallback) instead of proxying to `api.scryfall.com`, turning the whole client card-batch path DB-first with no consumer changes.

**Architecture:** One server-side route handler change. The route keeps its anti-abuse guards (75-cap, body-size, shape validation) and returns the same `ScryfallList<ScryfallCard>` shape (incl. `not_found`). It replaces the outbound Scryfall `fetch` with `card-source.getCardCollection(identifiers)`, which the route (being server-side) can import — a client hook could not.

**Tech Stack:** Next.js route handler, TypeScript, Supabase (via `card-source` → `catalog-db` → server client). No test framework — verify via `npm run check` + dev-server runtime.

## Global Constraints

- **No test framework** — verify via tsc + eslint + dev-server runtime (curl the route, read the dev log). Never write unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51 pre-existing problems). Gate on NO NEW problems via `npx eslint <changed file>`. (project memory)
- **Preserve the anti-abuse guards verbatim**: `MAX_IDENTIFIERS = 75`, `MAX_BODY_BYTES`, content-length check, body-size check, JSON-parse check, `{ identifiers: object[] }` 1..75 shape check. Only the outbound-fetch block changes. (spec)
- **Preserve the response shape**: return `card-source.getCardCollection`'s `ScryfallList<ScryfallCard>` as JSON, including `not_found` when present (consumers like `useImportPreviewFetch` read `listResult.not_found`). (spec)
- **Graceful errors**: the route must not throw uncaught — if `getCardCollection` rejects (e.g. the Scryfall fallback fails), return a sane error response (status 502) rather than a 500 stack, so a failing batch degrades like today. (spec)
- **Local Supabase running, DB seeded** (159k prints EN+FR, 1047 sets):
  - `SUPABASE_URL=http://127.0.0.1:54321`, service-role key not needed here (the route uses the request-scoped server client; catalog tables are public-read).
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- Modify: `src/app/api/scryfall/cards/collection/route.ts` — replace the outbound Scryfall fetch (lines ~47-63) with a `card-source.getCardCollection` call; add the import + a try/catch. Keep everything above line 46 (guards) unchanged.
- Modify: `messages/en.json`, `messages/fr.json` — add the `apiErrors.collectionResolutionFailed` key (see Task 1 note).

No new files.

---

## Task 1: Rewire the collection route to card-source

**Files:**

- Modify: `src/app/api/scryfall/cards/collection/route.ts`

**Interfaces:**

- Consumes: `getCardCollection` from `@/lib/card/source` (returns `Promise<ScryfallList<ScryfallCard>>`); `ScryfallCardIdentifier` from `@/lib/scryfall/types/scryfall`.
- Produces: the route resolves via DB-first + fallback; same request contract, same response shape.

- [ ] **Step 1: Replace the outbound-fetch block**

Add imports at the top:

```ts
import { getCardCollection } from '@/lib/card/source';
import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
```

Remove the now-unused `const SCRYFALL_URL = 'https://api.scryfall.com/cards/collection';` line.

Replace the outbound fetch block (currently lines ~47-63, from `const res = await fetch(SCRYFALL_URL, {` through the final `return NextResponse.json(data);`) with:

```ts
try {
	const list = await getCardCollection(identifiers as ScryfallCardIdentifier[]);
	return NextResponse.json(list);
} catch (err) {
	console.error('[api/scryfall/cards/collection] resolution failed:', err);
	return NextResponse.json({ error: t('collectionResolutionFailed') }, { status: 502 });
}
```

> **Implementer note on the error message key:** the catch returns a translated error via `getApiTranslations({ namespace: 'apiErrors' })`. Controller checked the `apiErrors` namespace in `messages/en.json` and `messages/fr.json`: existing keys are `notAuthenticated`, `serverNotConfigured`, `invalidDeckId`, `deckNotFound`, `moxfieldFetchFailed`, `invalidCommanderSlug`, `edhrecFetchFailed`, `bodyTooLarge`, `invalidJsonBody`, `missingIdentifiers`, `invalidIdentifiers`, `invalidRequest`, … — there is **no** upstream/unavailable key. Add a new key `collectionResolutionFailed` to the `apiErrors` object in BOTH `messages/en.json` and `messages/fr.json` (mirror the placement near the other identifier keys), with a short translated string (EN: "Failed to resolve cards." / FR: "Échec de la résolution des cartes."). Use `t('collectionResolutionFailed')` in the catch. Do NOT hardcode a raw English string (the file's pattern is all-translated). This makes the task touch 3 files (route + 2 message files) — that is expected and correct; note it in your report.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean (the `identifiers` were already validated as `object[]`; the cast to `ScryfallCardIdentifier[]` is safe post-validation).
Run: `npx eslint src/app/api/scryfall/cards/collection/route.ts` → no new problems. Confirm the removed `SCRYFALL_URL` const leaves no unused-var warning.

- [ ] **Step 3: Runtime — catalog cards resolve DB-first (no Scryfall call)**

Start the dev server: `npm run dev` (wait for "Ready"). Then POST a batch of catalog cards and read the dev log for Scryfall traffic:

```bash
# a known catalog print id (dsk/1 en) + a set+number + a name
curl -s -X POST http://localhost:3000/api/scryfall/cards/collection \
  -H 'Content-Type: application/json' \
  -d '{"identifiers":[{"id":"6f1a7590-3eee-4803-b192-d4fb771e6a86"},{"set":"dsk","collector_number":"1"},{"name":"Lightning Bolt"}]}' | head -c 400
```

Expected: HTTP 200, a JSON `{ object:"list", data:[...3 cards...] }` with the right names. In the dev-server log, confirm **no `api.scryfall.com/cards/collection`** request was made for this batch (all three resolved from the DB). (If the id isn't in your local DB, get a current one: `docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -d postgres -tAc "select id from card_prints where set='dsk' and collector_number='1' and lang='en';"`.)

- [ ] **Step 4: Runtime — fallback + not_found preserved**

```bash
# a bogus name that neither DB nor Scryfall resolves + one real catalog card
curl -s -X POST http://localhost:3000/api/scryfall/cards/collection \
  -H 'Content-Type: application/json' \
  -d '{"identifiers":[{"name":"Zzzz Not A Real Card Xyz"},{"set":"dsk","collector_number":"1"}]}' | head -c 500
```

Expected: HTTP 200; `data` contains the dsk/1 card; `not_found` contains the bogus identifier `{name:"Zzzz Not A Real Card Xyz"}`. (This proves the fallback ran for the miss and `not_found` survives.)

- [ ] **Step 5: Runtime — guards intact**

```bash
# >75 identifiers → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/scryfall/cards/collection \
  -H 'Content-Type: application/json' \
  -d "{\"identifiers\":[$(python3 -c 'print(",".join(["{\"name\":\"x\"}"]*76))')]}"
# malformed JSON → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/scryfall/cards/collection \
  -H 'Content-Type: application/json' -d 'not json'
```

Expected: `400` for both. Stop the dev server when done (`pkill -f "next"`).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/scryfall/cards/collection/route.ts
git commit -m "$(printf 'feat(api): collection route resolves DB-first via card-source\n\nPOST /api/scryfall/cards/collection now calls card-source.getCardCollection\n(DB-first + Scryfall fallback) instead of proxying to api.scryfall.com. All\nclient batch traffic (import/edhrec/deck resolution/collection/tokens) becomes\nDB-first with no consumer change. Guards (75-cap, body size, shape) and the\nScryfallList/not_found response shape preserved; failures return 502.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Final check

**Files:** none.

- [ ] **Step 1: Full project check**

Run: `npm run check`
Expected: no NEW problems beyond baseline; `npx eslint src/app/api/scryfall/cards/collection/route.ts` clean.

- [ ] **Step 2: Confirm the consumer contract is unchanged**

The client consumers still POST to `/api/scryfall/cards/collection` via `fetcher` and read `{ data, not_found }` — no consumer file changed. Confirm: `git diff --name-only <base>..HEAD` lists only the route file + `messages/en.json` + `messages/fr.json`. No hook/component changed.

- [ ] **Step 3: No commit** (verification only). Sub-project 1b-2 complete.

---

## Self-Review

**Spec coverage:**

- Rewire the route to `card-source.getCardCollection` → Task 1 Step 1. ✔
- Preserve 75-cap + anti-abuse guards (unchanged above line 46) → Task 1 (only the fetch block changes) + Step 5 verifies. ✔
- Preserve `ScryfallList` shape incl. `not_found` → Task 1 returns `list` as-is; Step 4 verifies. ✔
- Graceful error (502, no throw) → Task 1 try/catch. ✔
- No consumer changes → Task 2 Step 2. ✔
- Out of scope (intent functions, token two-step, other routes, raising 75) → not touched. ✔

**Placeholder scan:** No TBD/TODO. The error-message-key note is a real reconciliation step (reuse an existing translated key; the file is all-translated) with explicit fallback guidance — not a placeholder; the implementer picks a concrete existing key.

**Type consistency:** `getCardCollection(identifiers: ScryfallCardIdentifier[])` matches the call site; the post-validation cast `identifiers as ScryfallCardIdentifier[]` is sound because the guard already asserted `object[]`. Response type `ScryfallList<ScryfallCard>` is JSON-serialized unchanged, matching what consumers read today.
