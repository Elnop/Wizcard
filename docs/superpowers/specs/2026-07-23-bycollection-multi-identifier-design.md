# Extend byCollection to multi-identifier resolution — sub-project 1b-1

**Date**: 2026-07-23
**Status**: Design approved, ready for planning

## Context and goal

Sub-project 1a built the catalog read layer: `catalog-db` (pure DB reader → `ScryfallCard | null`)

- `card-source` (DB-first orchestrator with Scryfall fallback), and migrated the card page.

The next goal (1b) is to make `card-source` **the central card-retrieval service** for the
whole app — exposing intent-level functions (resolve a deck list, resolve by names, hydrate
parts, get a localized print) that handle DB-first + fallback + batching + name-matching
internally, so consumers stop calling Scryfall or `catalog-db` directly.

Most of those intent functions need to resolve a **batch of heterogeneous identifiers**
against the DB. Today `catalog-db.byCollection` only resolves `{id}` — every `{set,
collector_number}` or `{name}` identifier falls through to the Scryfall fallback. Since the
import flow (the biggest rate-limit cost) matches mostly by name and set+number, migrating it
would gain nothing until `byCollection` can resolve those forms in the DB.

**This sub-project (1b-1)** extends `catalog-db.byCollection` to resolve the identifier forms
the app actually uses — `{id}`, `{set, collector_number}`, `{name}` (+ language) — with an
**intra-DB English fallback**, in a bounded number of queries. It is the technical prerequisite
for the intent functions and consumer migration (1b-2, 1b-3).

### 1b decomposition (this spec is 1b-1)

| Sub-spec | Content                                                                                                           | Depends on |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| **1b-1** | **Extend `byCollection`: resolve {id}/{set,number}/{name}+lang, intra-DB EN fallback (this spec)**                | 1a         |
| 1b-2     | Intent functions `resolveByIds`/`resolveByNames`/`getLocalized`/`hydrateParts` + migrate their (simple) consumers | 1b-1       |
| 1b-3     | `resolveDeckList` (import cascade matching) + migrate `useResolveDeckList`/`useImportPreviewFetch`                | 1b-2       |

## Why localization collapses into resolution (key insight)

Today localization is a **two-step fetch forced by a Scryfall limitation**: `/cards/collection`
(the batch endpoint) does NOT take a language, so it only returns English prints. Code that
needs a localized card therefore resolves English first, then re-fetches each card
individually in the target language (`localizeTokens` "re-resolves each resolved English token
print into the language"; `useLocalizedImage` resolves then re-localizes). That is N extra
per-card calls.

Our DB removes the limitation: `card_prints` already holds FR prints (with `printed_name` and
localized image) at the **same level** as EN, keyed by `(set, collector_number, lang)`. So
resolving "card X in FR" is a single DB read in the **same batch** as everything else — the
language becomes a **parameter of resolution**, not a second step. `byCollection` taking a
target language is what enables the intent functions (1b-2) to drop the two-step pattern
entirely.

**Intra-DB English fallback is common, not rare** (verified): of 101,452 EN prints, 56,554 have
a FR print and **44,898 do not**. So when FR is requested and absent, falling back to the EN
print (before any Scryfall call) must be handled well — it is the common case.

## Design

### Signature change

```ts
// before (1a)
byCollection(ids: string[]): Promise<(ScryfallCard | null)[]>

// after (1b-1)
byCollection(
  identifiers: ScryfallCardIdentifier[],
  opts?: { lang?: string }
): Promise<(ScryfallCard | null)[]>
```

- Input order is **preserved**; a slot is `null` when the identifier resolves to nothing in the
  catalog (the `card-source` orchestrator above decides the Scryfall fallback — out of scope
  here).
- `ScryfallCardIdentifier` (existing type) already carries every form: `id`, `set` +
  `collector_number`, `name`, `oracle_id`, `mtgo_id`, `multiverse_id`, `lang`. An identifier may
  carry its own `lang`; `opts.lang` is the batch-level default when an identifier has none.

### Resolution by identifier form

| Form                             | DB resolution                          | Language / fallback                                                                                                               |
| -------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `{id}`                           | `card_prints.id`                       | language is intrinsic to the id (a print id is language-specific); no lang fallback needed                                        |
| `{set, collector_number, lang?}` | `(set, collector_number)`              | prefer the requested `lang`'s print; if absent, take the EN print (same `(set, collector_number)` key) — **intra-DB EN fallback** |
| `{name, lang?}`                  | see below                              | best-effort, mirroring today's Scryfall behavior                                                                                  |
| `{oracle_id}`                    | `card_prints.oracle_id` → chosen print | prefer `lang` then EN, most-recent print                                                                                          |
| `{mtgo_id}` / `{multiverse_id}`  | the external-id columns (added in 1a)  | intrinsic language                                                                                                                |

**Name matching** (`{name, lang?}`):

- `lang='fr'` (or any non-en): first try `card_prints.printed_name = name` (the FR printed name);
  if nothing, try `card_definitions.name = name` → the EN print (the supplied name may already be
  English, or the card has no translation). **FR-then-EN by name.**
- `lang='en'` (or absent): `card_definitions.name = name` → the EN print.
- Name matching is **best-effort** (case-insensitive), matching the current Scryfall-backed
  behavior. The import's richer cascade (set+number → set+name → name, `//` split) lives in the
  consumer / the future `resolveDeckList` (1b-3), not here — `byCollection` resolves one
  identifier per slot, it does not implement cross-identifier fallback policy.

### Query strategy

Group identifiers by form and issue a **bounded** number of queries (e.g. one for the `id`
group, one for the `(set, collector_number)` group via an `or(and(...))` filter, one for the
name group, etc.) — the exact count / chunking is an implementation decision for the plan. The
one hard rule: **never build a single unbounded `.or()`** over the whole batch — that is the
PostgREST URL-length trap the old `localized_cards` reader hit on large collections. Bound each
query (chunk large groups) so a 200-card list stays safe.

After the grouped reads, apply the per-form EN fallback, assemble via `rowsToScryfallCard`
(reusing 1a's `assemblePrints`), and re-thread results into input order.

### Scope

**In scope**

- Extend `catalog-db.byCollection` to the new signature + per-form resolution + intra-DB EN
  fallback + bounded grouped queries + order preservation.
- Update `card-source.getCardCollection` to call the new `byCollection` signature (it already
  receives `ScryfallCardIdentifier[]` from callers — today it maps them to `i.id ?? ''`; now it
  passes the structured identifiers through, so set+number and name identifiers resolve in the
  DB instead of always missing to Scryfall).

**Out of scope (later 1b specs)**

- The intent functions (`resolveByIds`, `resolveByNames`, `getLocalized`, `hydrateParts`,
  `resolveDeckList`) — 1b-2 / 1b-3.
- Migrating any consumer (import, edhrec, tokens, localized image) — they still call what they
  call today; only `getCardCollection`'s internal resolution improves.
- The import's multi-step name cascade (`//` split, set+name) — 1b-3's `resolveDeckList`.
- Fuzzy name matching — stays on Scryfall.

## Verification

No test framework (project convention) — verify via `npm run check` + runtime + psql:

- `byCollection` resolves each form against the seeded DB: an `{id}`, a `{set, collector_number}`
  (EN), a `{set, collector_number, lang:'fr'}` that has a FR print (returns the FR print with
  `printed_name`), a `{set, collector_number, lang:'fr'}` that has NO FR print (returns the EN
  print — intra-DB fallback), a `{name}` (EN), a `{name, lang:'fr'}` matching a `printed_name`.
- Order preservation: a mixed batch of the above returns results in input order, `null` for a
  genuinely-absent identifier.
- Bounded queries: a 200-identifier mixed batch does not build one giant URL (spot-check the
  query count / that it chunks) and completes without a PostgREST URI-too-long error.
- `card-source.getCardCollection` still returns the `ScryfallList<ScryfallCard>` shape its
  callers expect (`.data` + `.not_found`), now with set+number/name identifiers resolved from the
  DB (fewer Scryfall misses). No regression for `{id}`/`{oracle_id}`/`{name}` callers.
- `npm run check`: no NEW problems in changed files; tsc clean.
