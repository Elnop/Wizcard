# Custom fallback print via DB — sub-project 1b-G4

**Date**: 2026-07-23
**Status**: Design approved, ready for planning

## Context and goal

The card-data retrieval consolidation campaign migrates, system by system, every place
that fetches card data onto the DB-first path. Status after exploration:

| Group  | System                                                                   | Verdict                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1     | localization (`useLocalizedImage`, `localizeTokens`, `useCardEntryForm`) | **done**                                                                                                                                                                                          |
| G2     | prints (`useCardPrints`)                                                 | **dropped** — the Prints tab is intrinsically multilingual (groups editions by language, `include_multilingual`); our EN+FR catalog would regress it, so it stays on Scryfall like rulings/search |
| G3     | PDF export (`resolveLocalizedImageUri`)                                  | **already done via G1** — it delegates to `fetchLocalizedImage`, which G1 migrated                                                                                                                |
| **G4** | **custom fallback (`useCustomFallbackPrint`)**                           | **this spec**                                                                                                                                                                                     |

This spec is the last migratable group: `useCustomFallbackPrint`.

### What `useCustomFallbackPrint` does

`src/lib/scryfall/hooks/useCustomFallbackPrint.ts` (client hook, used by `CardImage.tsx`)
resolves a **default official print** for a custom card that must fall back to an official
image (ignored tag, or broken custom image). Custom cards usually carry only an
`oracle_id` — no set/collector — so the localized/English image hooks (which key on
set+collector) can't resolve them directly. So it fetches the newest print of the oracle,
which DOES have set/collector/image_uris, and the caller runs the normal localized→English
chain on top of it.

Today it does this via a Scryfall search:

```ts
const uri = `https://api.scryfall.com/cards/search?q=oracle_id%3A${oracleId}&unique=prints&order=released`;
const prints = await getCardPrints(uri, signal);
setResult({ oracleId, print: prints[0] ?? null });
```

That is **not** a real search — it is "the newest print of an oracle", which is
deterministic and fully covered by the EN+FR catalog. It takes only `prints[0]` (the
newest), NOT the multilingual list — so unlike G2 (prints tab), the DB genuinely covers
this use.

## Design

### 1. Preserve "newest print" in `catalog-db.resolveByOracleId`

`catalog-db.byCollection` already resolves `{oracle_id}` (added in 1b-1), but its
`resolveByOracleId` picks `pickByLang(rows, lang)` — the first row of the requested
language (or EN) in **PostgreSQL's unordered return**, with no date ordering. The old
`useCustomFallbackPrint` took `order=released`'s first result — the **newest** print. To
preserve that exactly, `resolveByOracleId` sorts the oracle's rows by `released_at`
descending before `pickByLang`:

```ts
function resolveByOracleId(ctx, id, lang): ScryfallCard | null {
	const rows = ctx.prints
		.filter((p) => p.oracle_id === id.oracle_id)
		.sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));
	const row = pickByLang(rows, lang);
	return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;
}
```

`released_at` is an ISO date string (`YYYY-MM-DD`), so descending string compare = newest
first. This benefits **every** `{oracle_id}` resolver (deterministic newest print), not
just the custom fallback. `PRINT_COLS` already includes `released_at`, and `PrintRow`
carries it — no query change needed.

### 2. Migrate `useCustomFallbackPrint` to `getCardCollection`

Replace the Scryfall search with a single-identifier `{oracle_id}` collection call
(client-safe: `getCardCollection` → `fetcher` → the DB-first `/cards/collection` route):

```ts
// before
import { getCardPrints } from '../endpoints/cards';
const uri = `https://api.scryfall.com/cards/search?q=oracle_id%3A${oracleId}&unique=prints&order=released`;
const prints = await getCardPrints(uri, controller.signal);
setResult({ oracleId, print: prints[0] ?? null });

// after
import { getCardCollection } from '../endpoints/cards';
const list = await getCardCollection([{ oracle_id: oracleId }], controller.signal);
setResult({ oracleId, print: list.data[0] ?? null });
```

- `getCardCollection` returns `ScryfallList<ScryfallCard>`; `list.data[0]` is the resolved
  print (the newest, per change 1), or absent → `null` (same as `prints[0] ?? null`).
- The abort signal is already threaded through `getCardCollection` (G1) and passed here.
- Everything else in the hook — result keying by `oracleId`, the abort handling, the
  render-time derivation (`result?.oracleId === oracleId ? … : null`), the `enabled`/`canFetch`
  gating — is **unchanged**.

### What is preserved

- The hook's public shape (`{ print, loading }`) and its keying/derivation logic.
- Abort-on-oracle-change (the controller in the effect, now threaded to `getCardCollection`).
- The "newest print" selection (change 1 restores it in the DB path).
- The `null` result when the oracle has no catalog print → the caller's existing
  behavior (no fallback print available).

### Result

The custom-card image fallback resolves DB-first (zero Scryfall calls for an oracle in the
catalog), and returns the same newest print the old search did. The campaign is then
**complete**: every migratable card-data retrieval system reads from the DB; only the
genuinely-multilingual prints tab, rulings, and search remain on Scryfall.

## Scope

**In scope**

- `catalog-db.resolveByOracleId`: sort the oracle's prints by `released_at` desc before
  `pickByLang` (newest-print selection for all `{oracle_id}` resolvers).
- `useCustomFallbackPrint`: swap `getCardPrints(search-uri)[0]` for
  `getCardCollection([{oracle_id}]).data[0]`.

**Out of scope**

- G2 prints tab (multilingual — stays on Scryfall).
- Anything else — this is the campaign's final, focused group.

## Verification

No test framework (project convention) — verify via `npm run check` + runtime:

- `getCardCollection([{oracle_id: <a known oracle>}])` (via the dev-server route) returns
  the **newest** print of that oracle (compare its `set`/`released_at` to the oracle's
  prints — should be the most recent), in the preferred language or EN.
- **`useCustomFallbackPrint` runtime**: a custom card in fallback (ignored tag / broken
  image) with an `oracle_id` resolves its fallback image from the DB — no
  `api.scryfall.com/cards/search` GET (dev log); the rendered fallback image is the newest
  official print, same as before the change.
- **No-catalog oracle**: an oracle absent from the catalog → `list.data[0]` is undefined →
  `print: null` → the caller shows no fallback (same as the old empty-search path).
- **Abort**: changing the card (new oracle) mid-fetch cancels the in-flight request (no
  stale print surfaced — the oracle-keying already guards this, plus the abort now cancels
  the request).
- `npm run check`: no NEW problems in changed files; tsc clean.
