# Localization via Collection Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the three two-step-localization systems (`useLocalizedImage`, `localizeTokens`, `useCardEntryForm`) off direct `getCardBySetNumberAndLang` (Scryfall) onto a client-safe `getLocalizedPrint` helper that resolves one print DB-first via the `/cards/collection` route — killing the two-step (language is in the identifier) with the client cache/fallback machinery preserved.

**Architecture:** Add an optional `AbortSignal` param to `getCardCollection`/`scryfallPost` (currently absent) so aborts still cancel. Add a client-safe `getLocalizedPrint(set, number, lang, signal?)` = `getCardCollection([{set, collector_number, lang}], signal).data[0] ?? null`. Point the three consumers at it, changing ONLY the resolution call — negative cache, IndexedDB cache, placeholder filter, and English fallback stay.

**Tech Stack:** TypeScript, Next.js, client fetch via `fetcher` → the DB-first `/api/scryfall/cards/collection` route. No test framework — verify via `npm run check` + runtime.

## Global Constraints

- **No test framework** — verify via tsc + eslint + dev-server runtime. Never write unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51 pre-existing problems). Gate on NO NEW problems via `npx eslint <changed files>`. (project memory)
- **Client-safe only**: `getLocalizedPrint` and its module must NOT import `card-source` or `@/lib/supabase/server` (server-only). It calls `scryfall/endpoints/cards.getCardCollection`, which goes through `fetcher` → the DB-first route. (spec)
- **Preserve `useLocalizedImage` machinery verbatim**: the module-level `notFound` negative cache, `getLocalizedImageFromCache`/`putLocalizedImageInCache` (IndexedDB), the `placeholder`/`missing` → treat-as-miss filter, and the English-fallback path. Only the network-resolution call changes. (spec)
- **Abort must keep working**: a card leaving the viewport / a modal closing must still cancel the in-flight request. The signal is threaded through the new `getCardCollection`/`scryfallPost` param. (spec)
- **`AbortSignal.any` is available** (Node 22 + modern browsers, verified) — use it to combine the caller's signal with the internal timeout controller.
- **Local Supabase running, DB seeded** (159k prints EN+FR, 1047 sets). SUPABASE_URL=http://127.0.0.1:54321.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- Modify: `src/lib/scryfall/utils/fetcher.ts` — `scryfallPost` accepts an optional `signal`, combined with the timeout controller.
- Modify: `src/lib/scryfall/endpoints/cards.ts` — `getCardCollection` accepts an optional `signal`, passes it to `scryfallPost`.
- Create: `src/lib/scryfall/getLocalizedPrint.ts` — the client-safe helper.
- Modify: `src/lib/scryfall/hooks/useLocalizedImage.ts` — swap 2 resolution calls (`fetchLocalizedImage` L152, `fetchEnglishImage` L223).
- Modify: `src/lib/scryfall/localizeTokens.ts` — swap `defaultFetchLocalized` (L32).
- Modify: `src/lib/card/components/EditCardModal/useCardEntryForm.ts` — swap the localized-preview fetch (L53).

---

## Task 1: Thread an AbortSignal through scryfallPost + getCardCollection

**Files:**

- Modify: `src/lib/scryfall/utils/fetcher.ts`
- Modify: `src/lib/scryfall/endpoints/cards.ts`

**Interfaces:**

- Produces: `scryfallPost<T>(endpoint, body, signal?)` and `getCardCollection(identifiers, signal?)` — both accept an optional caller `AbortSignal`; backward-compatible (existing callers pass nothing).

- [ ] **Step 1: Add `signal` to `scryfallPost`**

In `src/lib/scryfall/utils/fetcher.ts`, change the signature and combine signals. The function currently makes a per-attempt timeout controller; combine it with the caller's signal so either aborts the fetch.

```ts
export async function scryfallPost<T>(
	endpoint: string,
	body: object,
	signal?: AbortSignal
): Promise<T> {
	const url = resolvePostUrl(endpoint);

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
		// Combine the caller's abort signal (viewport exit, modal close) with the internal
		// timeout so either cancels this attempt.
		const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

		try {
			const response = await sharedScryfallThrottle.fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json;q=0.9,*/*;q=0.8',
				},
				body: JSON.stringify(body),
				signal: combined,
			});
			// ... rest of the try/catch/finally body UNCHANGED ...
```

Only the signature (add `signal?: AbortSignal`) and the `signal: controller.signal` → `signal: combined` line change (plus the `const combined = …` line). Everything else in the loop (error handling, retry/backoff, `clearTimeout(timeoutId)` in finally) stays exactly as-is.

- [ ] **Step 2: Add `signal` to `getCardCollection`**

In `src/lib/scryfall/endpoints/cards.ts`:

```ts
export async function getCardCollection(
	identifiers: ScryfallCardIdentifier[],
	signal?: AbortSignal
): Promise<ScryfallList<ScryfallCard>> {
	return scryfallPost<ScryfallList<ScryfallCard>>('/cards/collection', { identifiers }, signal);
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit` → clean (additive optional param; existing callers unaffected). `npx eslint src/lib/scryfall/utils/fetcher.ts src/lib/scryfall/endpoints/cards.ts` → no new problems.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/utils/fetcher.ts src/lib/scryfall/endpoints/cards.ts
git commit -m "$(printf 'feat(scryfall): thread AbortSignal through scryfallPost/getCardCollection\n\nOptional caller signal combined with the internal timeout via AbortSignal.any,\nso a caller (viewport exit, modal close) can cancel an in-flight collection\nrequest. Additive/backward-compatible.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: The `getLocalizedPrint` client helper

**Files:**

- Create: `src/lib/scryfall/getLocalizedPrint.ts`

**Interfaces:**

- Consumes: `getCardCollection(identifiers, signal?)` from Task 1.
- Produces: `getLocalizedPrint(set, collectorNumber, lang, signal?): Promise<ScryfallCard | null>`.

- [ ] **Step 1: Write the helper**

```ts
// Resolve ONE print in the requested language, DB-first. Goes through
// getCardCollection → fetcher → the DB-first /api/scryfall/cards/collection route
// (single identifier). Client-safe: no card-source / server import. Returns null when
// neither the DB nor the Scryfall fallback resolves it. Replaces the old two-step
// "resolve English then re-fetch in lang" pattern — the language is in the identifier.

import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export async function getLocalizedPrint(
	set: string,
	collectorNumber: string,
	lang: string,
	signal?: AbortSignal
): Promise<ScryfallCard | null> {
	const list = await getCardCollection([{ set, collector_number: collectorNumber, lang }], signal);
	return list.data[0] ?? null;
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` and `npx eslint src/lib/scryfall/getLocalizedPrint.ts` → clean. Confirm no server-only import: `grep -n "supabase/server\|card/source" src/lib/scryfall/getLocalizedPrint.ts` → empty.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scryfall/getLocalizedPrint.ts
git commit -m "$(printf 'feat(scryfall): getLocalizedPrint helper (DB-first single localized lookup)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Migrate `useLocalizedImage` (both resolution sites)

**Files:**

- Modify: `src/lib/scryfall/hooks/useLocalizedImage.ts`

**Interfaces:**

- Consumes: `getLocalizedPrint` (Task 2).
- Produces: `fetchLocalizedImage` and `fetchEnglishImage` resolve DB-first; all cache/fallback logic unchanged.

- [ ] **Step 1: Swap the two resolution calls**

Replace the import `import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';` with `import { getLocalizedPrint } from '@/lib/scryfall/getLocalizedPrint';`.

At the `fetchLocalizedImage` site (~line 152), change:

```ts
// before
const localized = await getCardBySetNumberAndLang(card.set!, card.collector_number!, lang, signal);
// after
const localized = await getLocalizedPrint(card.set!, card.collector_number!, lang, signal);
```

`getLocalizedPrint` returns `ScryfallCard | null`. The old `getCardBySetNumberAndLang` returned `ScryfallCard` (threw on 404). So the null case must be handled: if `localized` is null, treat it as a miss — the SAME path the old catch/placeholder branch used. Add right after the call:

```ts
if (!localized) {
	notFound.add(cacheKey);
	void putLocalizedImageInCache({ key: cacheKey, cachedAt: Date.now(), missing: true });
	return null;
}
```

Then the existing `placeholder`/`missing` check and the persist-to-IndexedDB block follow unchanged.

At the `fetchEnglishImage` site (~line 223), change:

```ts
// before
const english = await getCardBySetNumberAndLang(card.set, card.collector_number, 'en', signal);
// after
const english = await getLocalizedPrint(card.set, card.collector_number, 'en', signal);
```

And likewise handle the null case with the same miss pattern used in that function (mirror its existing catch branch):

```ts
if (!english) {
	notFound.add(cacheKey);
	void putLocalizedImageInCache({ key: cacheKey, cachedAt: Date.now(), missing: true });
	return null;
}
```

> **Implementer note:** Read both functions fully first. The old code relied on `getCardBySetNumberAndLang` THROWING on a 404 (caught by the existing `catch` that records the miss). `getLocalizedPrint` returns `null` instead of throwing for a not-found, so the explicit null-guard above replaces that catch-path for the not-found case. Keep the existing `try/catch` too (for real network errors / aborts) — the catch's abort handling (`if (e instanceof DOMException && e.name === 'AbortError') return null;`) must remain. Do not duplicate the miss-persist: the null-guard handles not-found, the catch handles errors. Verify the `cacheKey` variable is in scope at each null-guard (it is — computed earlier in each function).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean (no more `getCardBySetNumberAndLang` reference in this file; confirm with `grep -n getCardBySetNumberAndLang src/lib/scryfall/hooks/useLocalizedImage.ts` → empty). `npx eslint src/lib/scryfall/hooks/useLocalizedImage.ts` → no new problems.

- [ ] **Step 3: Runtime — localized grid is DB-first**

Start the dev server (kill any lingering one first: `pkill -9 -f next-server`, or `PORT=3001 npm run dev`). Set the app's card language to French (profile settings) or open a view that renders FR cards. Load a grid of catalog cards.

- Confirm localized images render.
- In the dev-server log / browser network tab, confirm **no `api.scryfall.com/cards/<set>/<num>/<lang>` GET** for catalog cards — resolution goes to `POST /api/scryfall/cards/collection`.
- Second load of the same grid: IndexedDB cache warm → no network at all.
- A card absent from the catalog: still localizes via the route fallback, or falls back to its English image (no broken image).

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/hooks/useLocalizedImage.ts
git commit -m "$(printf 'feat(scryfall): useLocalizedImage resolves DB-first via getLocalizedPrint\n\nBoth fetchLocalizedImage and fetchEnglishImage swap the direct Scryfall lookup\nfor getLocalizedPrint (DB-first, lang in the identifier — no two-step). Negative\ncache, IndexedDB cache, placeholder filter, and English fallback unchanged; the\nnot-found case (now a null return instead of a throw) is handled explicitly.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Migrate `localizeTokens` and `useCardEntryForm`

**Files:**

- Modify: `src/lib/scryfall/localizeTokens.ts`
- Modify: `src/lib/card/components/EditCardModal/useCardEntryForm.ts`

**Interfaces:**

- Consumes: `getLocalizedPrint` (Task 2).

- [ ] **Step 1: `localizeTokens`**

In `src/lib/scryfall/localizeTokens.ts`, replace the import and `defaultFetchLocalized`:

```ts
// import: replace getCardBySetNumberAndLang with getLocalizedPrint
import { getLocalizedPrint } from '@/lib/scryfall/getLocalizedPrint';

// defaultFetchLocalized (~line 32): getLocalizedPrint returns null on not-found, but the
// dep contract is Promise<ScryfallCard> (the caller keeps the English token on failure).
// Preserve that: throw when null so the existing try/catch in localizeTokens falls back
// to the English token (its catch returns the original token).
function defaultFetchLocalized(set: string, num: string, lang: string): Promise<ScryfallCard> {
	return getLocalizedPrint(set, num, lang).then((card) => {
		if (!card) throw new Error('localized print not found');
		return card;
	});
}
```

> **Implementer note:** read `localizeTokens` — each token is wrapped in `try { return await fetchLocalized(...) } catch { return token }`. So a null→throw makes a not-found token correctly keep its English print, exactly like the old 404-throw did. The injected `deps.fetchLocalized` shape is unchanged.

- [ ] **Step 2: `useCardEntryForm`**

In `src/lib/card/components/EditCardModal/useCardEntryForm.ts`, replace the import (`getCardBySetNumberAndLang` → `getLocalizedPrint`) and the call (~line 53):

```ts
// before
const localized = await getCardBySetNumberAndLang(
	action.set,
	action.collectorNumber,
	action.langCode,
	controller.signal
);
// after
const localized = await getLocalizedPrint(
	action.set,
	action.collectorNumber,
	action.langCode,
	controller.signal
);
```

`getLocalizedPrint` returns `ScryfallCard | null`. Read the surrounding code: `setSelectedPrint(localized)` is called on success. If `localized` is null (not found), do NOT set a null print — keep the existing behavior for "no localized print" (the old code threw and was caught). Guard:

```ts
if (controller.signal.aborted) return;
if (!localized) {
	// no print in that language — leave the current preview, like the old 404 path
	setLangInfoMessage(/* the existing "not available" message, if any — else null */ null);
	return;
}
setSelectedPrint(localized);
setLangInfoMessage(null);
```

> **Implementer note:** read the existing `catch (err)` block in this function to see how it currently surfaces a not-found (it may set a `langInfoMessage`). Mirror that exact behavior in the null-guard so the UX is unchanged; keep the `catch` for real errors/aborts. Do not invent a new message string — reuse whatever the catch already uses (or `null` if it just clears).

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit` → clean; confirm no `getCardBySetNumberAndLang` left in either file (`grep -rn getCardBySetNumberAndLang src/lib/scryfall/localizeTokens.ts src/lib/card/components/EditCardModal/useCardEntryForm.ts` → empty). `npx eslint <both files>` → no new problems.

- [ ] **Step 4: Runtime**

Dev server. (a) Open a deck with tokens in FR → tokens localize (dev log: collection route, not per-token Scryfall GET); an untranslated token keeps its English print. (b) Open the Edit modal on a card, change the language → the preview updates from the DB; close the modal mid-fetch → aborts cleanly (no post-close state update / console error).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scryfall/localizeTokens.ts src/lib/card/components/EditCardModal/useCardEntryForm.ts
git commit -m "$(printf 'feat(scryfall): localizeTokens + useCardEntryForm resolve DB-first\n\nBoth swap direct getCardBySetNumberAndLang for getLocalizedPrint. Not-found\n(null) preserves prior behavior: tokens keep their English print, the edit\npreview keeps the current print.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Final check

**Files:** none.

- [ ] **Step 1: Full project check**

Run: `npm run check` → no NEW problems beyond baseline. `npx eslint` clean on all changed files.

- [ ] **Step 2: Confirm no direct localized Scryfall lookup remains**

Run: `grep -rn "getCardBySetNumberAndLang" src/ | grep -v node_modules | grep -v "card/source\|endpoints/cards.ts"`
Expected: only `src/lib/card/source/index.ts` (the server orchestrator's own fallback) and the endpoint definition remain — no client consumer calls it directly anymore. The three migrated consumers show `getLocalizedPrint` instead.

- [ ] **Step 3: No commit** (verification only). Sub-project 1b-G1 complete.

---

## Self-Review

**Spec coverage:**

- Client-safe `getLocalizedPrint` via `getCardCollection` single identifier → Task 2. ✔
- Thread AbortSignal through getCardCollection/scryfallPost → Task 1. ✔
- Migrate `useLocalizedImage` (both `fetchLocalizedImage` + `fetchEnglishImage`) → Task 3. ✔
- Migrate `localizeTokens` + `useCardEntryForm` → Task 4. ✔
- Preserve cache/negative-cache/placeholder-filter/EN-fallback → Task 3 (only the resolution call changes; null-guard replaces the old 404-throw path). ✔
- Abort semantics preserved → Task 1 (signal threaded) + Tasks 3/4 (signal passed). ✔
- Out of scope (per-grid batching, G2/G3/G4) → not touched. ✔

**Placeholder scan:** No TBD/TODO. The two implementer notes on `useCardEntryForm`'s
`langInfoMessage` and `useLocalizedImage`'s catch are real "read the existing behavior and
mirror it" instructions (the not-found UX must match today's), not placeholders — the code
to write is fully specified except the exact existing message key, which the implementer
copies from the current catch rather than inventing.

**Type consistency:** `getLocalizedPrint(set, collectorNumber, lang, signal?) → ScryfallCard | null` is used identically in Tasks 3/4. `getCardCollection(identifiers, signal?)` (Task 1) matches the call in `getLocalizedPrint` (Task 2). `scryfallPost(endpoint, body, signal?)` (Task 1) matches `getCardCollection`'s call. The null-vs-throw difference (getLocalizedPrint returns null where getCardBySetNumberAndLang threw) is explicitly handled at every migrated site.
