# Localization via the DB-first collection route — sub-project 1b-G1

**Date**: 2026-07-23
**Status**: Design approved, ready for planning

## Context and goal

The card-data retrieval consolidation campaign (part of 1b) migrates, system by system,
every place that fetches card data so its logic runs through the central retrieval path
instead of calling Scryfall directly. 1b-2 already routed the **batch** path
(`/cards/collection`) DB-first, so all `getCardCollection` consumers benefit.

This spec is **group G1: localization** — the three systems still calling
`getCardBySetNumberAndLang` **directly against `api.scryfall.com`** from the client:

| System                                                                           | Role                          | Today                                     |
| -------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `useLocalizedImage` (`src/lib/scryfall/hooks/useLocalizedImage.ts`)              | localized card image in grids | direct Scryfall GET (+ IndexedDB cache)   |
| `localizeTokens` (`src/lib/scryfall/localizeTokens.ts`)                          | localized token prints        | direct Scryfall GET (two-step re-resolve) |
| `useCardEntryForm` (`src/lib/card/components/EditCardModal/useCardEntryForm.ts`) | localized preview on edit     | direct Scryfall GET                       |

These are the **two-step localization** pattern: resolve English, then re-fetch each card
individually in the target language — forced by Scryfall's `/cards/collection` not taking
a language. Our DB removes that limit (FR prints sit at the same level as EN, keyed by
`(set, collector_number, lang)`), so the language becomes a resolution **parameter**: one
DB-first lookup, no second step.

### Campaign decomposition (this spec is G1)

| Group                             | Systems                                                   | Endpoint today              |
| --------------------------------- | --------------------------------------------------------- | --------------------------- |
| **G1 — Localization (this spec)** | `useLocalizedImage`, `localizeTokens`, `useCardEntryForm` | `getCardBySetNumberAndLang` |
| G2 — Prints                       | `useCardPrints`                                           | `getCardPrints`             |
| G3 — PDF export                   | `resolveLocalizedImageUri`                                | `fetchLocalizedImage`       |
| G4 — Custom fallback              | `useCustomFallbackPrint`                                  | (to assess)                 |

Out of the campaign entirely (stay on Scryfall): rulings (`RulingsTab`), similar
(`SimilarTab` — search).

## Why route through `/cards/collection`, not a new per-card route

The three consumers are **client** code. `card-source` is server-only (it imports
`@/lib/supabase/server`), so a client hook cannot import it. But the batch route
`/cards/collection` is already DB-first (1b-2) and reachable from the client: the client
`fetcher` (`src/lib/scryfall/utils/fetcher.ts`) rewrites `POST /cards/collection` to
`/api/scryfall/cards/collection`. And `catalog-db.byCollection` already resolves
`{set, collector_number, lang}` with an intra-DB EN fallback (1b-1).

So a single-identifier collection call **is** a DB-first localized single lookup — no new
route, no server import in client code. `scryfall/endpoints/cards.getCardCollection` (and
the whole `endpoints`/`fetcher` chain) is client-safe (verified: no server-only imports).

## Design

### The shared client helper

A new client-safe helper resolves one localized print DB-first via the collection route:

```ts
// resolves one print in the requested language, DB-first (Scryfall fallback inside
// the /cards/collection route). Returns null when neither DB nor Scryfall resolves it.
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

- Lives in a client-safe module (e.g. `src/lib/scryfall/getLocalizedPrint.ts`). It calls
  `scryfall/endpoints/cards.getCardCollection` — NOT `card-source` — so it stays client-safe
  and goes through `fetcher` → the DB-first route.
- **Abort signal (confirmed work, not conditional)**: the three consumers pass an
  `AbortSignal` today (card leaves viewport, modal closes). Verified: neither
  `getCardCollection` nor `scryfallPost` currently accepts a caller signal —
  `scryfallPost` creates its own `AbortController` only for the `TIMEOUT`. So this work
  **must** thread a signal through: add an optional `signal?: AbortSignal` param to
  `getCardCollection` and to `scryfallPost`, and combine the caller's signal with the
  internal timeout controller (e.g. `AbortSignal.any([caller, timeout])`, or abort the
  internal controller when the caller's signal fires). Without this, a card leaving the
  viewport / a closing modal would no longer cancel its in-flight request — a regression.
  This also benefits every other `getCardCollection` caller (none pass a signal today, so
  it's additive/backward-compatible).

### Consumer changes

**`useLocalizedImage`** — replace only step 2 of `fetchLocalizedImage` (the
`getCardBySetNumberAndLang(...)` call) with `getLocalizedPrint(set, number, lang, signal)`.
**Everything else is unchanged**: the module-level negative cache (`notFound`), the
IndexedDB read/write (`getLocalizedImageFromCache`/`putLocalizedImageInCache`), the
`placeholder`/`missing` → treat-as-miss filter, and the English-fallback path
(`fetchEnglishImage`, which similarly swaps its `getCardBySetNumberAndLang('en')` call for
`getLocalizedPrint(set, number, 'en', signal)`). The two-step disappears because the lang
is in the identifier.

**`localizeTokens`** — its `defaultFetchLocalized(set, num, lang)` swaps
`getCardBySetNumberAndLang` for `getLocalizedPrint`. The injected-dep shape
(`deps.fetchLocalized`) is preserved so its unit-of-behavior stays testable/overridable.

**`useCardEntryForm`** — its localized-preview fetch swaps `getCardBySetNumberAndLang(set,
number, langCode, signal)` for `getLocalizedPrint(set, number, langCode, signal)`,
preserving the abort controller.

### What is preserved

- IndexedDB localized-image cache + negative cache in `useLocalizedImage` — unchanged
  (this is the client dedup layer; a warm cache still means zero network).
- The `placeholder`/`missing` filtering and English fallback.
- Abort-on-unmount / abort-on-viewport-exit semantics (via the propagated signal).
- The `ScryfallCard` shape consumers read — `getCardCollection` returns full
  `ScryfallList<ScryfallCard>` entries, same shape `getCardBySetNumberAndLang` returned.

### Result

Localized images, tokens, and edit-previews resolve DB-first (zero Scryfall calls for
catalog cards), the two-step localization is gone (language is a resolution parameter), and
the client cache/fallback machinery is untouched. Only catalog-absent cards fall back to
Scryfall — inside the route, batched ≤75.

## Scope

**In scope**

- New client-safe `getLocalizedPrint` helper (via `getCardCollection` single-identifier).
- Ensure `getCardCollection`/`scryfallPost`/`fetcher` propagate an `AbortSignal` (add if missing).
- Migrate `useLocalizedImage` (both `fetchLocalizedImage` and `fetchEnglishImage`),
  `localizeTokens`, `useCardEntryForm` to `getLocalizedPrint`.

**Out of scope (later)**

- Per-grid batching (resolve a whole visible list in one call) — a possible later group;
  G1 keeps the per-card shape (the IndexedDB cache already dedups).
- G2 prints (`useCardPrints`), G3 PDF export (`resolveLocalizedImageUri`), G4 custom
  fallback.
- Rulings / similar / search — stay on Scryfall.

## Verification

No test framework (project convention) — verify via `npm run check` + runtime:

- `getLocalizedPrint('dsk','1','fr')` (via a client path / dev server) returns the FR
  print ("Cheerleader acrobatique"); `'en'` returns the EN print; a no-FR card in `'fr'`
  returns the EN print (intra-DB fallback, from 1b-1); a bogus set/number returns null.
- **Abort**: an aborted signal cancels the in-flight request (no state update after abort)
  — same behavior as today.
- **`useLocalizedImage` runtime**: a FR-language grid renders localized images from the DB
  with **no `api.scryfall.com/cards` GET** for catalog cards (dev log); a card absent from
  the catalog still localizes via the route fallback or falls back to English; the
  IndexedDB cache still warms (second view = no network).
- **`localizeTokens`**: a deck's tokens localize (dev log shows the collection route, not a
  per-token Scryfall GET); an untranslated token keeps its English print (fallback).
- **`useCardEntryForm`**: changing the language in the edit modal updates the preview from
  the DB; closing the modal mid-fetch aborts cleanly.
- `npm run check`: no NEW problems in changed files; tsc clean.
