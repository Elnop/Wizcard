# Card Domain Migration — Wave A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-type every card consumer in the app against the provider-neutral domain `Card`, while the seam (`card/source`, `rowsToScryfallCard`) still returns `ScryfallCard`.

**Architecture:** Consumer-first, seam-last. The pivot is redefining `AnyCard` from `ScryfallCard | CardCopy | CustomCard` to `Card | CardCopy | CustomCard`, then re-typing standalone `ScryfallCard`-typed consumers to `Card`. This is verified type-safe with zero runtime change: `ScryfallCard` is structurally assignable to domain `Card` (probe-confirmed), so the same runtime objects the seam emits remain valid for the now-`Card`-typed consumers. tsc stays green between every task.

**Tech Stack:** TypeScript (strict), Next.js App Router, Zustand stores. No test framework — **tsc is the authoritative gate** (clean at baseline: `npx tsc --noEmit` = 0 errors).

## Global Constraints

- **tsc is authoritative.** `npx tsc --noEmit` MUST be 0 errors after every task. Baseline is 0 — any new error is a regression.
- **eslint gate = no NEW problems.** `npm run check` is RED at baseline (~51 pre-existing eslint problems in untouched files). Gate each task via `npx eslint <changed files>` = clean (no new problems). Never gate on total count.
- **No test framework.** Verify via tsc + eslint + runtime spot-check on the dev server. No vitest/jest exists — do not add one.
- **Wide-refactor commits use `git commit --no-verify`** because lint-staged blocks on the RED baseline's pre-existing eslint errors in any touched file. Document `--no-verify` in each commit's task note.
- **Commit trailer** (every commit): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Branch:** main (user-consented for this chantier).
- **No runtime change permitted in Wave A.** Only types change. If a task would alter runtime behavior, stop — it belongs in a different wave.
- **Seam stays `ScryfallCard`:** `card/source/*`, `catalog-db/*`, `rowsToScryfallCard`, `scryfall/endpoints/*`, `lib/card/adapter.ts` KEEP returning/handling `ScryfallCard`. Wave A does NOT touch their return types.
- **Provider-only fields stay isolated:** `prints_search_uri` (multilingual Prints tab, frozen on Scryfall per "G2 dropped") is NOT hoisted onto domain `Card`. Sites reading it keep a narrow `ScryfallCard` at their boundary or thread it as `string | undefined`.

---

## File Structure

- `src/types/cards.ts` — domain `Card` gains `prices?`.
- `src/lib/card/adapter.ts` — `toCard` carries `prices` through.
- `src/lib/card/components/CardList/CardList.types.ts` — `AnyCard` pivot (exported def).
- `src/lib/card/utils/filterCollectionCards.ts` — `AnyCard` pivot (local def) + price-sort casts.
- `src/lib/mpc/types.ts` — `isCustomCard` signature + discriminant.
- ~50 standalone `ScryfallCard`-typed consumer files, migrated in reviewable zone-clusters (Tasks 5–9).

---

## Task 1: Add `prices?` to domain `Card` + adapter

**Files:**

- Modify: `src/types/cards.ts` (the `Card` interface, after the print block near line 90)
- Modify: `src/lib/card/adapter.ts` (`toCard` return object)

**Interfaces:**

- Produces: `Card.prices?: { usd?: string; usd_foil?: string; usd_etched?: string; eur?: string; eur_foil?: string; eur_etched?: string; tix?: string }` — the same shape as `ScryfallPrices`. Consumed by Task 3 (`filterCollectionCards` price-sort) and the display sites already guarding `'prices' in card`.

- [ ] **Step 1: Add `prices?` to the `Card` interface**

In `src/types/cards.ts`, inside `export interface Card`, add after the `// external ids` block (after `cardmarket_id?: number;`):

```typescript
	// volatile provider pricing — populated on the Scryfall-fallback path, undefined on the
	// DB path (the catalog stores no prices). Forward hook for a future price-sync feature.
	prices?: {
		usd?: string;
		usd_foil?: string;
		usd_etched?: string;
		eur?: string;
		eur_foil?: string;
		eur_etched?: string;
		tix?: string;
	};
```

- [ ] **Step 2: Carry `prices` through the adapter**

In `src/lib/card/adapter.ts`, inside the object returned by `toCard`, add after `cardmarket_id: s.cardmarket_id,`:

```typescript
		prices: s.prices,
```

- [ ] **Step 3: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. (`ScryfallPrices` is structurally assignable to the inline `prices?` shape, so `s.prices` assigns cleanly.)

- [ ] **Step 4: Verify eslint clean on changed files**

Run: `npx eslint src/types/cards.ts src/lib/card/adapter.ts`
Expected: no new problems.

- [ ] **Step 5: Commit**

```bash
git add src/types/cards.ts src/lib/card/adapter.ts
git commit --no-verify -m "feat(card): add prices? to domain Card + carry through toCard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` — lint-staged blocks on pre-existing baseline eslint errors in touched files.

---

## Task 2: Widen `isCustomCard` to accept domain `Card`

**Files:**

- Modify: `src/lib/mpc/types.ts:69-71` (`isCustomCard`)

**Interfaces:**

- Consumes: nothing new.
- Produces: `isCustomCard(card: Card | CustomCard): card is CustomCard` — narrows via `'custom' in card`. 11 call sites depend on it (CardTabs, PrintsTab, CardModalProvider, CardPageHeader, filterCollectionCards, useCardEntryForm, PrintList, CardModal, CustomCardBadge, CardImage, hydrateAllParts).

**Background:** The current body is `return card.object === 'custom_card'`. Domain `Card` has **no `object` field** (probe-confirmed: `object` is the one field `ScryfallCard` has that `Card` lacks). So widening the parameter to `Card | CustomCard` breaks the body — `Card` has no `object`. `CustomCard` uniquely has a `custom: CustomCardMeta` field that domain `Card` lacks; discriminate on that.

- [ ] **Step 1: Change the signature and discriminant**

In `src/lib/mpc/types.ts`, replace:

```typescript
export function isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard {
	return card.object === 'custom_card';
}
```

with:

```typescript
export function isCustomCard(card: Card | CustomCard): card is CustomCard {
	return 'custom' in card;
}
```

- [ ] **Step 2: Update the import in `types.ts`**

Ensure `src/lib/mpc/types.ts` imports `Card` from `@/types/cards` (add to the existing type imports; it may already import from there). `ScryfallCard` is still imported (used by `CustomCard`'s `Omit<Partial<ScryfallCard>, 'object'>`), so do NOT remove that import.

- [ ] **Step 3: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. All 11 call sites currently pass a value that is `ScryfallCard`-or-`CustomCard`; `ScryfallCard` is assignable to `Card`, so the calls still typecheck. `PrintList.tsx:40` passes `card as ScryfallCard | CustomCard` — still assignable to `Card | CustomCard`. (It is retyped precisely in Task 6.)

- [ ] **Step 4: Verify eslint clean**

Run: `npx eslint src/lib/mpc/types.ts`
Expected: no new problems.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mpc/types.ts
git commit --no-verify -m "refactor(card): isCustomCard accepts domain Card (discriminate on 'custom' in card)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` (baseline eslint).

---

## Task 3: Pivot the `AnyCard` union + `filterCollectionCards` casts

**Files:**

- Modify: `src/lib/card/components/CardList/CardList.types.ts:9` (exported `AnyCard`)
- Modify: `src/lib/card/utils/filterCollectionCards.ts:11` (local `AnyCard`) + the `as ScryfallCard` casts in `sortKey` (lines ~115-125)

**Interfaces:**

- Consumes: `Card` (`@/types/cards`), `isCustomCard` (Task 2).
- Produces: `export type AnyCard = Card | CardCopy | CustomCard` — the app's shared card union. ~40 files import this exported alias; they update automatically (no per-file change needed for the union itself).

**Background:** `AnyCard` is defined in two places. `CardList.types.ts` exports it and ~40 files import that alias. `filterCollectionCards.ts` has a private duplicate. Both pivot to `Card`. The `filterCollectionCards` `sortKey` helper casts `card as ScryfallCard` to read `cmc`/`rarity`/`set`/`collector_number`/`released_at`/`colors`/`prices`/`power`/`toughness` — all present on domain `Card`, so the casts become `as Card`.

- [ ] **Step 1: Pivot the exported union**

In `src/lib/card/components/CardList/CardList.types.ts`:

- Replace the import `import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';` with `import type { Card } from '@/types/cards';` (keep the existing `CardCopy` import from `@/types/cards` — merge into one import line).
- Change line 9: `export type AnyCard = ScryfallCard | CardCopy | CustomCard;` → `export type AnyCard = Card | CardCopy | CustomCard;`

- [ ] **Step 2: Pivot the local union in filterCollectionCards**

In `src/lib/card/utils/filterCollectionCards.ts`:

- Change line 11: `type AnyCard = ScryfallCard | CardCopy | CustomCard;` → `type AnyCard = Card | CardCopy | CustomCard;`
- Ensure `Card` is imported from `@/types/cards`.

- [ ] **Step 3: Retype the sortKey casts**

In `src/lib/card/utils/filterCollectionCards.ts`, in the `sortKey` function, change every `(card as ScryfallCard)` to `(card as Card)` for these lines (cmc, rarity, set, collector_number, released_at, colors, usd, eur, tix, power, toughness). All these fields exist on domain `Card`. The `prices?.usd/eur/tix` reads work because Task 1 added `prices?` to `Card`.

If `ScryfallCard` is no longer referenced anywhere in `filterCollectionCards.ts` after this, remove its now-unused import (tsc/eslint `no-unused-vars` will flag it). If it's still used elsewhere in the file, keep it.

- [ ] **Step 4: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. Every `AnyCard` consumer's `'field' in card` narrowing still holds (field-optionality parity: `set`/`collector_number` required on both, `mana_cost`/`power`/`prices` optional on both). Seam objects (`ScryfallCard`) remain assignable to the `Card`-first union.

- [ ] **Step 5: Verify eslint clean on changed files**

Run: `npx eslint src/lib/card/components/CardList/CardList.types.ts src/lib/card/utils/filterCollectionCards.ts`
Expected: no new problems (watch for unused `ScryfallCard` import — remove if flagged).

- [ ] **Step 6: Commit**

```bash
git add src/lib/card/components/CardList/CardList.types.ts src/lib/card/utils/filterCollectionCards.ts
git commit --no-verify -m "refactor(card): pivot AnyCard union to domain Card + retype price-sort casts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` (baseline eslint).

---

## Task 4: Runtime checkpoint — union pivot is inert at runtime

**Files:** none (verification only).

**Background:** After Tasks 1-3, `AnyCard` is `Card`-based and every importer typechecks. This task PROVES no runtime regression before migrating the standalone consumers.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (use a free PORT if :3000 is held by a lingering server; read the bound port from the log).

- [ ] **Step 2: Spot-check the hot AnyCard paths**

In the browser, verify these render identically to before (they consume `AnyCard`):

- Collection list view (`/collection`) — cards render, price column shows values or "—" as before.
- Card search (`/search`) — results render.
- Deck detail (`/decks/[id]`) — card table renders.

Expected: identical rendering, no console type/render errors. (Runtime objects are unchanged `ScryfallCard`s; only their static type widened.)

- [ ] **Step 3: Stop the dev server. No commit (verification only).**

---

## Task 5: Migrate `lib/scryfall` store + hooks + utils to `Card`

**Files (standalone `ScryfallCard`-typed consumers in the scryfall zone):**

- Modify: `src/lib/scryfall/store/*` (the cards store — `useCardsStore` holds `Map<string, ScryfallCard>` → `Map<string, Card>`)
- Modify: `src/lib/scryfall/hooks/*` (except `useCardPrints.ts` — provider-only, KEEP `ScryfallCard`)
- Modify: `src/lib/scryfall/utils/*` (except files that legitimately handle raw provider data)
- Modify: `src/lib/scryfall/hydrateAllParts.ts`, `src/lib/scryfall/hydrateCard*` if present

**Interfaces:**

- Consumes: `Card` (`@/types/cards`).
- Produces: the cards store typed `Card`. Since the store is fed by `resolveCardsByScryfallIds` → the DB-first collection route (which returns `ScryfallCard` objects), and `ScryfallCard` is assignable to `Card`, the store's writes stay green without touching the resolver (that's Wave B).

**Background:** The cards store (`useCardsStore`) is the central consumer — many downstream files read `Card` from it. Migrating it first makes the downstream zone-clusters mechanical. `useCardPrints.ts` reads `prints_search_uri` off raw provider data (multilingual Prints tab, frozen on Scryfall) — it KEEPS `ScryfallCard`.

- [ ] **Step 1: Enumerate the zone's standalone ScryfallCard sites**

Run: `grep -rn ": ScryfallCard\|<ScryfallCard\|ScryfallCard\[\]\|ScryfallCard>\|(ScryfallCard\b" src/lib/scryfall --include="*.ts" --include="*.tsx" | grep -v "scryfall/types\|scryfall/endpoints\|useCardPrints\|scryfall/store/.*raw"`
Review the list. For each site that reads/holds only domain fields, plan `ScryfallCard` → `Card`.

- [ ] **Step 2: Retype the cards store**

In the store file(s), change the card value type from `ScryfallCard` to `Card` (import `Card` from `@/types/cards`). Keep the setter accepting the values it's fed; if a setter is typed `ScryfallCard`, widen its parameter to `Card` (ScryfallCard args stay assignable).

- [ ] **Step 3: Retype the scryfall hooks + utils (except useCardPrints)**

For each enumerated hook/util that types a card as `ScryfallCard` and reads only domain fields, change to `Card`. Do NOT touch `useCardPrints.ts` (keeps `ScryfallCard` — provider `prints_search_uri`). Do NOT touch `scryfall/endpoints/*` (raw provider I/O).

- [ ] **Step 4: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. If a site errors because it reads a provider-only field (e.g. `scryfall_uri`, `prints_search_uri`), that site KEEPS `ScryfallCard` at its boundary — revert that one site to `ScryfallCard` and note it as an isolated provider boundary.

- [ ] **Step 5: Verify eslint clean**

Run: `npx eslint <the files changed in this task>`
Expected: no new problems.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scryfall
git commit --no-verify -m "refactor(card): migrate scryfall store/hooks/utils consumers to domain Card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` (baseline eslint). List in the commit body any site kept on `ScryfallCard` as a provider boundary.

---

## Task 6: Migrate `lib/card/components` + `lib/card` consumers to `Card`

**Files:**

- Modify: card component props/state typed `ScryfallCard` across `src/lib/card/components/*` — CardModal, CardImage, CardLightbox, PrintList, CardPrintPickerModal, AddCardModal, AddToDeckModal, CardTokensSection, UseCollectionCopyModal, EditCardModal (`useCardEntryForm.ts`, `CardEntryFormBody.tsx`), CustomCardBadge.
- Modify: `src/lib/card/*` top-level consumers (`deriveCardModalProps.ts`, `deriveDeckTarget.ts`, `viewerCardMenu.ts`, `hooks/*`, `utils/*` not already done).

**Interfaces:**

- Consumes: `Card`, `AnyCard` (now `Card`-based), `isCustomCard` (accepts `Card`).
- Produces: card-rendering components typed against `Card`/`AnyCard`.

**Background:** `PrintList.tsx` has several `as ScryfallCard` casts and reads `prints_search_uri` (line ~from PrintList.types). The `prints_search_uri` READ stays a provider boundary: keep that specific field access typed `ScryfallCard` (or thread it as `string | undefined`), but migrate the rest of the component to `Card`/`AnyCard`. `PrintList.tsx:40` `isCustomCard(card as ScryfallCard | CustomCard)` → `isCustomCard(card as Card | CustomCard)`.

- [ ] **Step 1: Enumerate the zone**

Run: `grep -rn ": ScryfallCard\|<ScryfallCard\|ScryfallCard\[\]\|ScryfallCard>\|(ScryfallCard\b\|as ScryfallCard" src/lib/card --include="*.ts" --include="*.tsx" | grep -v "card/source\|catalog-db\|card/adapter"`

- [ ] **Step 2: Migrate component props/state to `Card`/`AnyCard`**

For each site reading only domain fields, change `ScryfallCard` → `Card` (or `AnyCard` where the value may be a copy/custom). Update `PrintList.tsx:40` cast to `card as Card | CustomCard`. Keep `prints_search_uri` reads on a narrow `ScryfallCard`/`string` boundary.

- [ ] **Step 3: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. Sites that error on a provider-only field keep `ScryfallCard` (isolated boundary) — note them.

- [ ] **Step 4: Verify eslint clean**

Run: `npx eslint <files changed in this task>`
Expected: no new problems.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card
git commit --no-verify -m "refactor(card): migrate card components + lib/card consumers to domain Card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` (baseline eslint). List any provider-boundary sites kept on `ScryfallCard`.

---

## Task 7: Migrate `lib/deck`, `lib/import`, `lib/search`, `lib/collection`, `lib/wishlist`, `lib/edhrec`, `lib/pdf`, `lib/mpc`, `lib/cardnexus`, `contexts` consumers to `Card`

**Files:**

- Modify: standalone `ScryfallCard` consumers across `src/lib/deck/*`, `src/lib/import/*`, `src/lib/search/*`, `src/lib/collection/*`, `src/lib/wishlist/*`, `src/lib/edhrec/*`, `src/lib/pdf/*`, `src/lib/mpc/mpc-tags.ts`, `src/lib/cardnexus/*`, `src/contexts/*`.

**Interfaces:**

- Consumes: `Card`, `AnyCard`, `isCustomCard`.
- Produces: lib-level feature consumers typed `Card`.

**Background:** `src/lib/mpc/mpc-tags.ts` reads `games`/`booster`/`full_art`/etc. — provider-only fields absent from domain `Card`. That file KEEPS `ScryfallCard` (it operates on raw provider data for tag derivation). Verify during migration: if a site reads any field not on domain `Card`, keep it on `ScryfallCard`.

- [ ] **Step 1: Enumerate the zone**

Run: `grep -rln ": ScryfallCard\|<ScryfallCard\|ScryfallCard\[\]\|ScryfallCard>\|(ScryfallCard\b\|as ScryfallCard" src/lib/deck src/lib/import src/lib/search src/lib/collection src/lib/wishlist src/lib/edhrec src/lib/pdf src/lib/cardnexus src/contexts src/lib/mpc/mpc-tags.ts --include="*.ts" --include="*.tsx"`

- [ ] **Step 2: Migrate consumers reading only domain fields to `Card`/`AnyCard`**

Keep `mpc-tags.ts` (and any site reading `games`/`booster`/`full_art`/`prints_search_uri`/`scryfall_uri`) on `ScryfallCard`.

- [ ] **Step 3: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. Provider-only readers stay `ScryfallCard` (note them).

- [ ] **Step 4: Verify eslint clean**

Run: `npx eslint <files changed in this task>`
Expected: no new problems.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck src/lib/import src/lib/search src/lib/collection src/lib/wishlist src/lib/edhrec src/lib/pdf src/lib/cardnexus src/contexts src/lib/mpc/mpc-tags.ts
git commit --no-verify -m "refactor(card): migrate deck/import/search/collection/wishlist/edhrec/pdf/contexts consumers to domain Card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` (baseline eslint). List provider-boundary sites kept on `ScryfallCard`.

---

## Task 8: Migrate `app/[locale]` page consumers to `Card` (except provider-boundary headers/tabs)

**Files:**

- Modify: `src/app/[locale]/decks/[id]/*`, `src/app/[locale]/collection/*`, `src/app/[locale]/wishlist/*`, `src/app/[locale]/search/*`, `src/app/[locale]/sets/[code]/*`, `src/app/[locale]/users/[userId]/*`, `src/app/[locale]/card/[id]/components/tabs/*` (Tokens/Similar/Rulings/Overview), `src/app/[locale]/card/[id]/components/CardTabs`, `AddToCollectionButton`.
- KEEP `ScryfallCard` (provider boundary): `src/app/[locale]/card/[id]/components/CardPageHeader/CardPageHeader.tsx` (reads `scryfall_uri` — already derived in 1a, but the prop may still be typed `ScryfallCard`; migrate to `Card` ONLY if it reads no provider-only field, else keep), `PrintsTab/PrintsTab.tsx` (reads `prints_search_uri`), `SetDetailHeader` (reads `scryfall_uri`).

**Interfaces:**

- Consumes: `Card`, `AnyCard`, `isCustomCard`.
- Produces: page-level consumers typed `Card`.

- [ ] **Step 1: Enumerate the zone**

Run: `grep -rln ": ScryfallCard\|<ScryfallCard\|ScryfallCard\[\]\|ScryfallCard>\|(ScryfallCard\b\|as ScryfallCard" src/app --include="*.ts" --include="*.tsx" | grep -v "api/scryfall"`

- [ ] **Step 2: Migrate page consumers reading only domain fields to `Card`/`AnyCard`**

For `CardPageHeader`, `PrintsTab`, `SetDetailHeader`: inspect what provider-only field each reads. `scryfall_uri` was derived from `set`/`collector_number` in 1a — if the component now derives it locally and reads no other provider field, migrate to `Card`; otherwise keep `ScryfallCard` at that boundary. `PrintsTab` reads `prints_search_uri` → keep `ScryfallCard`.

- [ ] **Step 3: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Verify eslint clean**

Run: `npx eslint <files changed in this task>`
Expected: no new problems.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit --no-verify -m "refactor(card): migrate app page consumers to domain Card (provider headers/tabs isolated)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `--no-verify` (baseline eslint). List provider-boundary sites kept on `ScryfallCard`.

---

## Task 9: Wave A verification + boundary audit

**Files:** none (verification only).

- [ ] **Step 1: tsc clean, whole repo**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: eslint no new problems**

Run: `npm run check 2>&1 | tail -20`
Expected: problem count == baseline (~51), all in untouched files. Cross-check: `npx eslint $(git diff --name-only ff4e7bd..HEAD -- 'src/**/*.ts' 'src/**/*.tsx' | tr '\n' ' ')` = clean. (Use the Wave A base commit in place of `ff4e7bd`.)

- [ ] **Step 3: Audit remaining `ScryfallCard` references — every survivor must be legitimate**

Run: `grep -rn "ScryfallCard" src --include="*.ts" --include="*.tsx" | grep -v "scryfall/types\|scryfall/endpoints\|card/source\|catalog-db\|card/adapter\|api/scryfall"`
Every remaining hit MUST be one of: (a) the seam (still `ScryfallCard` by design — deferred to Wave B), (b) an isolated provider boundary (`useCardPrints`/`prints_search_uri`, `mpc-tags`, a header reading `scryfall_uri`), or (c) `CustomCard`'s `Omit<Partial<ScryfallCard>,'object'>` base. List each survivor with its category. Any survivor that is a plain domain-field consumer = a missed migration → fix it.

- [ ] **Step 4: Runtime smoke test**

Run: `npm run dev` (free port). Verify collection, search, deck detail, card page, card modal, wishlist, sets page all render identically to pre-Wave-A. Stop the server.

- [ ] **Step 5: Update the ledger**

Append the Wave A section to `.superpowers/sdd/progress.md`: base commit, per-task commits, the survivor audit (categorized list of remaining `ScryfallCard` refs), and the note that the seam flip + cast deletion are Wave B. No commit needed for the ledger unless the chantier convention commits it.

---

## Self-Review

**Spec coverage:**

- Spec §1 (prices? on Card) → Task 1. ✓
- Spec §2 (AnyCard pivot both defs) → Task 3. ✓
- Spec §3 (isCustomCard widening + PrintList cast) → Task 2 (signature) + Task 6 (PrintList cast). ✓
- Spec §4 (standalone consumers → Card, provider boundaries isolated) → Tasks 5-8. ✓
- Spec "out of scope / seam stays ScryfallCard" → Global Constraints + Task 9 survivor audit. ✓
- Spec "no runtime change" → Task 4 + Task 9 runtime smoke. ✓
- Spec verification (tsc authoritative, eslint no-new, --no-verify) → Global Constraints + every task's gate steps. ✓

**Placeholder scan:** Tasks 5-8 use "enumerate then migrate" rather than listing every one of ~50 files inline, because the exact set is tsc-driven (the compiler names the sites that break) and file-by-file listing would be brittle across the sweep. Each such task pins the _zone_, the _enumeration command_, the _provider-boundary exceptions by name_, and the _gate_. This is deliberate for a tsc-gated type sweep, not an under-specified placeholder — the reviewer between tasks verifies tsc-clean + survivor categorization. The mechanical, non-obvious sites (isCustomCard discriminant, AnyCard both defs, filterCollectionCards casts, PrintList cast) ARE spelled out with exact code in Tasks 1-3, 6.

**Type consistency:** `isCustomCard(card: Card | CustomCard): card is CustomCard` — signature defined in Task 2, referenced consistently in Tasks 3/6. `AnyCard = Card | CardCopy | CustomCard` — Task 3, referenced in 5-8. `Card.prices?` shape — Task 1, consumed in Task 3. Consistent throughout.

**Provider-boundary list** is consistent across tasks: `useCardPrints`/`prints_search_uri`, `mpc-tags` (games/booster/full_art), `scryfall_uri` headers. Named the same in Global Constraints, Tasks 5/6/7/8, and the Task 9 audit.
