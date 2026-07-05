# Card Filters: Color Identity, Color-cost label, Supertypes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Color Identity filter (`ci<=`), relabel the mana-cost color filter as `Colors (cost)`, and surface supertypes (Legendary, etc.) in the Type filter — everywhere the shared filter UI is used (collection, search, deck finder).

**Architecture:** The filter state (`CardFilters`) is shared and extended by `CollectionFilters`. Local filtering lives in `filterCollectionCards.ts`; Scryfall-side filtering in `buildScryfallQuery` (already supports `ci<=`). We add one field, one small UI component, one local matcher, and thread the field through the shared `FilterModal` plus its three consumers. Supertypes is a one-line catalog addition.

**Tech Stack:** Next.js (App Router), React, TypeScript, Zustand (scryfall store), CSS Modules.

## Global Constraints

- No test framework in this repo — verification is `npm run check` (TS + ESLint + Prettier) plus runtime observation in `npm run dev`. Never claim a task passes without running `npm run check`.
- Color set is fixed: `W U B R G` (`MTG_COLORS`, `ScryfallColor`).
- Color Identity has a **single** semantic: `at most` (`ci<=`). No mode selector.
- Follow existing filter-component conventions (label casing, CSS-module reuse, `useMultiSelect`).
- Commit after each task. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Supertypes in the type catalog

**Files:**

- Modify: `src/lib/scryfall/types/api.ts` (add `'supertypes'` to `ScryfallCatalogType` union, near line 84)
- Modify: `src/lib/scryfall/endpoints/catalog.ts` (add `'supertypes'` to `TYPE_CATALOGS`, lines 9-17)

**Interfaces:**

- Consumes: nothing.
- Produces: `getAllCardTypes()` now returns supertype names (Legendary, Basic, Snow, World, Ongoing, Host, Elite) mixed into the sorted list — consumed by `TypeFilter` unchanged.

- [ ] **Step 1: Add `'supertypes'` to the catalog union**

In `src/lib/scryfall/types/api.ts`, the `ScryfallCatalogType` union currently ends:

```ts
	| 'flavor-words'
	| 'card-types';
```

Change to:

```ts
	| 'flavor-words'
	| 'card-types'
	| 'supertypes';
```

- [ ] **Step 2: Add `'supertypes'` to `TYPE_CATALOGS`**

In `src/lib/scryfall/endpoints/catalog.ts`, change:

```ts
const TYPE_CATALOGS: ScryfallCatalogType[] = [
	'card-types',
	'creature-types',
	'planeswalker-types',
	'land-types',
	'artifact-types',
	'enchantment-types',
	'spell-types',
];
```

to:

```ts
const TYPE_CATALOGS: ScryfallCatalogType[] = [
	'card-types',
	'supertypes',
	'creature-types',
	'planeswalker-types',
	'land-types',
	'artifact-types',
	'enchantment-types',
	'spell-types',
];
```

- [ ] **Step 3: Verify types + lint**

Run: `npm run check`
Expected: PASS (no TS/ESLint/Prettier errors).

- [ ] **Step 4: Runtime check**

Run: `npm run dev`. Open the Search page, click Filtres, focus the Type field, type `Legend`. Expected: `Legendary` appears in suggestions. Add it and search — results are all legendary cards.

Note: the scryfall store persists `cardTypes` in localStorage with a TTL. If `Legendary` doesn't appear, clear the `scryfall-*` localStorage key (or wait for TTL) to force a re-fetch.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scryfall/types/api.ts src/lib/scryfall/endpoints/catalog.ts
git commit -m "feat(filters): include supertypes in Type filter suggestions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Relabel the cost-color filter

**Files:**

- Modify: `src/lib/search/components/filters/ColorFilter/ColorFilter.tsx:35`

**Interfaces:**

- Consumes: nothing.
- Produces: no API change — cosmetic label only.

- [ ] **Step 1: Change the label**

In `ColorFilter.tsx`, change:

```tsx
<span className={styles.label}>Colors</span>
```

to:

```tsx
<span className={styles.label}>Colors (cost)</span>
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/components/filters/ColorFilter/ColorFilter.tsx
git commit -m "feat(filters): clarify color filter matches mana cost

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Add `colorIdentity` to shared filter state

**Files:**

- Modify: `src/lib/search/types.ts` (`CardFilters`, `DEFAULT_CARD_FILTERS`, `countActiveFilters`)

**Interfaces:**

- Consumes: `ScryfallColor` (already imported).
- Produces: `CardFilters.colorIdentity: ScryfallColor[]`, `DEFAULT_CARD_FILTERS.colorIdentity = []`, and `countActiveFilters` now adds `filters.colorIdentity.length`. `CollectionFilters` inherits the field via `extends Omit<CardFilters, 'order'>`; `defaultCollectionFilters` inherits `[]` via `...DEFAULT_CARD_FILTERS`.

- [ ] **Step 1: Add the field to `CardFilters`**

In `src/lib/search/types.ts`, change:

```ts
export interface CardFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch: ColorMatch;
	type: string[];
```

to:

```ts
export interface CardFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch: ColorMatch;
	colorIdentity: ScryfallColor[];
	type: string[];
```

- [ ] **Step 2: Add the default**

Change:

```ts
export const DEFAULT_CARD_FILTERS: CardFilters = {
	name: '',
	colors: [],
	colorMatch: 'include',
	type: [],
```

to:

```ts
export const DEFAULT_CARD_FILTERS: CardFilters = {
	name: '',
	colors: [],
	colorMatch: 'include',
	colorIdentity: [],
	type: [],
```

- [ ] **Step 3: Count it as active**

In `countActiveFilters`, change the return expression's first line:

```ts
	return (
		filters.colors.length +
```

to:

```ts
	return (
		filters.colors.length +
		filters.colorIdentity.length +
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: PASS. (TS may now flag consumers that build `CardFilters`-shaped objects without `colorIdentity` — the `countActiveFilters` call sites in `useSearchFiltersFromUrl.ts` and `useCollectionFiltering` pass through `filters`/inline objects; if a NEW error appears there, it is expected and fixed in Tasks 7-8. If `npm run check` fails ONLY at those two call sites, proceed; otherwise fix the reported file.)

Note: `countActiveFilters` is called in `useSearchFiltersFromUrl.ts:193` with an inline object literal that omits `colorIdentity`. Add `colorIdentity,` to that literal now to keep the build green:

In `useSearchFiltersFromUrl.ts`, change:

```ts
	const activeFilterCount = countActiveFilters({
		name: '',
		colors,
		colorMatch,
		type,
```

to:

```ts
	const activeFilterCount = countActiveFilters({
		name: '',
		colors,
		colorMatch,
		colorIdentity,
		type,
```

(`colorIdentity` state is added in Task 7; if it doesn't exist yet, TS will error here — in that case temporarily pass `colorIdentity: []` and revisit in Task 7. Prefer doing Task 7 right after this task.)

Re-run: `npm run check` — resolve to PASS before committing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/types.ts src/app/search/useSearchFiltersFromUrl.ts
git commit -m "feat(filters): add colorIdentity to shared filter state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `ColorIdentityFilter` component

**Files:**

- Create: `src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx`

**Interfaces:**

- Consumes: `MTG_COLORS`, `ManaSymbol`, `useMultiSelect`, `ScryfallColor`, `ScryfallCardSymbol`. Reuses the existing `ColorFilter.module.css` (no new CSS file — the component has no mode-selector).
- Produces: `ColorIdentityFilter` component with props `{ selected: ScryfallColor[]; onChange: (colors: ScryfallColor[]) => void; symbolMap?: Record<string, ScryfallCardSymbol> }`.

- [ ] **Step 1: Create the component**

Create `src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx`:

```tsx
'use client';

import type { ScryfallColor, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { MTG_COLORS } from '@/lib/mtg/colors';
import { useMultiSelect } from '@/lib/search/hooks/useMultiSelect';
import styles from '../ColorFilter/ColorFilter.module.css';

export interface ColorIdentityFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
	symbolMap?: Record<string, ScryfallCardSymbol>;
}

export function ColorIdentityFilter({
	selected,
	onChange,
	symbolMap = {},
}: ColorIdentityFilterProps) {
	const { toggle: handleToggle } = useMultiSelect(selected, onChange);

	return (
		<div className={styles.container}>
			<span className={styles.label}>Color identity</span>
			<div className={styles.colors}>
				{MTG_COLORS.map((color) => (
					<button
						key={color.id}
						type="button"
						className={`${styles.colorButton} ${selected.includes(color.id) ? styles.selected : ''}`}
						data-color={color.id}
						onClick={() => handleToggle(color.id)}
						aria-pressed={selected.includes(color.id)}
						title={color.name}
					>
						<ManaSymbol symbol={`{${color.id}}`} symbolMap={symbolMap} />
					</button>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: PASS. (Component is not yet imported anywhere — ESLint may warn if the project errors on unused exports; it does not here, exports are fine.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx
git commit -m "feat(filters): add ColorIdentityFilter component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Local matcher for color identity

**Files:**

- Modify: `src/lib/card/utils/filterCollectionCards.ts` (add `matchColorIdentity`, wire into `cardMatchesFilters`)

**Interfaces:**

- Consumes: `filters.colorIdentity` (from Task 3), `card.color_identity` (on `ScryfallCard`).
- Produces: `cardMatchesFilters` now rejects cards whose color identity is not a subset of a non-empty selection.

- [ ] **Step 1: Add the matcher**

In `filterCollectionCards.ts`, directly after the `matchColors` function (ends ~line 83), add:

```ts
function matchColorIdentity(
	cardColorIdentity: ScryfallColor[] | undefined,
	selected: ScryfallColor[]
): boolean {
	// "At most" (ci<=): every color of the card's identity must be in the selection.
	if (selected.length === 0) return true;
	const identity = cardColorIdentity ?? [];
	return identity.every((c) => selected.includes(c));
}
```

- [ ] **Step 2: Wire it into `cardMatchesFilters`**

In `cardMatchesFilters`, find:

```ts
if (!matchColors(card.colors, filters.colors, filters.colorMatch)) return false;
if (!matchesType(card.type_line, filters.type)) return false;
```

Change to:

```ts
if (!matchColors(card.colors, filters.colors, filters.colorMatch)) return false;
if (!matchColorIdentity((card as ScryfallCard).color_identity, filters.colorIdentity)) return false;
if (!matchesType(card.type_line, filters.type)) return false;
```

(`card` is `AnyCard`; `color_identity` is guaranteed on `ScryfallCard` and treated as empty/`[]` when absent on a `CustomCard`, so missing ⇒ matches.)

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Runtime check (collection)**

`npm run dev` → Collection page. Set Color identity to {W,U} in the sidebar (available after Task 8) — deferred; for now confirm no crash and existing filters still work. Functional runtime check happens in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/utils/filterCollectionCards.ts
git commit -m "feat(filters): filter cards by color identity locally (at most)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire `colorIdentity` through `FilterModal`

**Files:**

- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx`

**Interfaces:**

- Consumes: `ColorIdentityFilter` (Task 4), `useScryfallSymbols` (already used).
- Produces: `FilterModal` accepts a `colorIdentity: ScryfallColor[]` prop and emits `colorIdentity` in its `onApply` payload. Renders `ColorIdentityFilter` right below `ColorFilter` in the `variant !== 'backs'` block.

- [ ] **Step 1: Import the component**

After the `ColorFilter` import (line 11), add:

```tsx
import { ColorIdentityFilter } from '@/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter';
```

- [ ] **Step 2: Add prop to `FilterModalProps`**

In `FilterModalProps`, after `colorMatch?: ColorMatch;` (line 33), add:

```tsx
	colorIdentity: ScryfallColor[];
```

And in the `onApply` payload type, after `colorMatch: ColorMatch;` (line 51), add:

```tsx
		colorIdentity: ScryfallColor[];
```

- [ ] **Step 3: Add to `FilterModalContentProps`**

After `initialColorMatch: 'exact' | 'include' | 'atMost';` (line 71), add:

```tsx
	initialColorIdentity: ScryfallColor[];
```

- [ ] **Step 4: Destructure + draft state in `FilterModalContent`**

Add `initialColorIdentity,` to the destructured params (near `initialColorMatch,` line ~92).

After the `draftColorMatch` state (line ~114), add:

```tsx
const [draftColorIdentity, setDraftColorIdentity] = useState<ScryfallColor[]>(initialColorIdentity);
```

- [ ] **Step 5: Emit in `handleApply`**

In `handleApply`'s `onApply({...})`, after `colorMatch: draftColorMatch,` (line ~139), add:

```tsx
			colorIdentity: draftColorIdentity,
```

- [ ] **Step 6: Reset**

In `handleReset`, inside the `if (variant !== 'backs')` block, after `setDraftColorMatch('include');` (line ~157), add:

```tsx
setDraftColorIdentity([]);
```

- [ ] **Step 7: Render the filter**

After the `<ColorFilter ... />` block (closes ~line 198), add:

```tsx
<ColorIdentityFilter
	selected={draftColorIdentity}
	onChange={setDraftColorIdentity}
	symbolMap={symbolMap}
/>
```

- [ ] **Step 8: Pass through in the `FilterModal` wrapper**

In the outer `FilterModal` function signature, add `colorIdentity,` to the destructured props (after `colorMatch = 'include',`, line ~253).

In the `<FilterModalContent ... />` JSX, after `initialColorMatch={colorMatch}` (line ~282), add:

```tsx
initialColorIdentity = { colorIdentity };
```

- [ ] **Step 9: Verify**

Run: `npm run check`
Expected: TS errors at the three call sites that render `<FilterModal>` without a `colorIdentity` prop (`CollectionFiltersBar`, `search/page.tsx`, `CardSearchPanel`) — these are fixed in Tasks 7-9. If errors appear ONLY there, proceed. Otherwise fix the reported file.

- [ ] **Step 10: Commit**

```bash
git add src/lib/search/components/FilterModal/FilterModal.tsx
git commit -m "feat(filters): wire colorIdentity through FilterModal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Search page + URL state

**Files:**

- Modify: `src/app/search/useSearchFiltersFromUrl.ts`
- Modify: `src/app/search/page.tsx`

**Interfaces:**

- Consumes: `FilterModal` `colorIdentity` prop + `onApply.colorIdentity` (Task 6); `SearchFilters.colorIdentity` on `useScryfallCardSearch` (already exists).
- Produces: color-identity state persisted to the `ci` URL param and fed to both the modal and the Scryfall search.

- [ ] **Step 1: Add state to `useSearchFiltersFromUrl`**

After the `colorMatch` state (line ~105), add:

```ts
const [colorIdentity, setColorIdentity] = useState<ScryfallColor[]>(() =>
	parseColors(searchParams.get('ci'))
);
```

- [ ] **Step 2: Extend `SearchFilters` type in this file**

In the local `SearchFilters` type (line 80), after `colorMatch: 'exact' | 'include' | 'atMost';`, add:

```ts
	colorIdentity: ScryfallColor[];
```

- [ ] **Step 3: Persist to URL**

In the URL-sync `useEffect`, after `if (colorMatch !== 'include') params.set('colorMatch', colorMatch);` (line ~142), add:

```ts
if (colorIdentity.length > 0) params.set('ci', colorIdentity.join(','));
```

Add `colorIdentity,` to the effect's dependency array (after `colorMatch,`, line ~163).

- [ ] **Step 4: Apply + count + return**

In `applyFilters`, after `setColorMatch(filters.colorMatch);` (line ~180), add:

```ts
setColorIdentity(filters.colorIdentity);
```

In the `countActiveFilters({...})` call (line ~193), ensure `colorIdentity,` is present (added in Task 3 Step 4; confirm it references this new state).

In the returned object (line ~206), after `colorMatch,`, add:

```ts
		colorIdentity,
```

- [ ] **Step 5: Consume in `page.tsx`**

In `search/page.tsx`, add `colorIdentity` to the destructure from `useSearchFiltersFromUrl()` (near `colorMatch,` line ~70).

Pass it to `useScryfallCardSearch` — in the filters object (lines 106-117), after `colorMatch,`, add:

```tsx
			colorIdentity,
```

Pass it to `FilterModal` — after `colorMatch={colorMatch}` (line 229), add:

```tsx
colorIdentity = { colorIdentity };
```

(Backs variant: `FilterModal` hides the color section for `variant="backs"`, and `useCustomCards` doesn't take color identity — no change needed there. The `ci` param simply persists unused in backs mode, consistent with how other hidden filters behave.)

Update `hasFilters` (line ~163) to include it:

```tsx
const hasFilters =
	name ||
	colors.length > 0 ||
	colorIdentity.length > 0 ||
	type.length > 0 ||
	set ||
	rarities.length > 0 ||
	oracleText ||
	cmc;
```

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: PASS (search-page call site now satisfied).

- [ ] **Step 7: Runtime check (search)**

`npm run dev` → Search. Open Filtres, set Color identity to {W,U}, apply. Expected: only cards with identity ⊆ {W,U}; URL gains `ci=W,U`; filter badge count increases; reload preserves the selection; Reset clears it and removes `ci`.

- [ ] **Step 8: Commit**

```bash
git add src/app/search/useSearchFiltersFromUrl.ts src/app/search/page.tsx
git commit -m "feat(search): color identity filter with URL persistence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Collection view + sidebar/bar

**Files:**

- Modify: `src/app/collection/lib/CollectionView/CollectionFiltersBar/CollectionFiltersBar.tsx`
- Modify: `src/app/collection/lib/CollectionView/CollectionFiltersAside/CollectionFiltersAside.tsx`

**Interfaces:**

- Consumes: `filters.colorIdentity` (inherited by `CollectionFilters` from Task 3); `FilterModal` `colorIdentity` prop (Task 6); `ColorIdentityFilter` (Task 4); local matcher (Task 5).
- Produces: color-identity control in both the modal-based bar and the sidebar; local filtering already honors it via `filterCollectionCards`.

- [ ] **Step 1: `CollectionFiltersBar` — pass to FilterModal + apply**

In `CollectionFiltersBar.tsx`, after `colorMatch={filters.colorMatch}` (line 66), add:

```tsx
				colorIdentity={filters.colorIdentity}
```

In the `onApply` handler, after `colorMatch: applied.colorMatch,` (line 81), add:

```tsx
						colorIdentity: applied.colorIdentity,
```

- [ ] **Step 2: `CollectionFiltersAside` — import**

In `CollectionFiltersAside.tsx`, after the `ColorFilter` import (line 7), add:

```tsx
import { ColorIdentityFilter } from '@/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter';
```

- [ ] **Step 3: `CollectionFiltersAside` — render below ColorFilter**

After the `<ColorFilter ... />` block (closes line 100), add:

```tsx
<ColorIdentityFilter
	selected={filters.colorIdentity}
	onChange={(colorIdentity: ScryfallColor[]) => patch('colorIdentity', colorIdentity)}
	symbolMap={symbolMap}
/>
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Runtime check (collection)**

`npm run dev` → Collection. In the sidebar, set Color identity to {W} — expect only mono-white-identity (and colorless with no off-color identity) cards; badge count reflects it; Reset clears it. Open the modal bar variant (if enabled for that layout) and confirm the same control applies.

- [ ] **Step 6: Commit**

```bash
git add src/app/collection/lib/CollectionView/CollectionFiltersBar/CollectionFiltersBar.tsx src/app/collection/lib/CollectionView/CollectionFiltersAside/CollectionFiltersAside.tsx
git commit -m "feat(collection): color identity filter in bar and sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Deck finder (CardSearchPanel) + commander intersection

**Files:**

- Modify: `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`

**Interfaces:**

- Consumes: `FilterModal` `colorIdentity` prop + `onApply.colorIdentity` (Task 6); `SearchFilters.colorIdentity` (already exists); local matcher (Task 5); `CollectionFilters.colorIdentity` (Task 3).
- Produces: user color-identity control in the finder that **intersects** with any commander color-identity constraint.

- [ ] **Step 1: Add state**

After `const [colorMatch, setColorMatch] = useState<...>('include');` (line 66), add:

```tsx
const [colorIdentity, setColorIdentity] = useState<ScryfallColor[]>([]);
```

- [ ] **Step 2: Count it as active**

In `activeFilterCount` (line ~82), change:

```tsx
		const activeFilterCount =
			colors.length +
			(filterType.length > 0 ? 1 : 0) +
```

to:

```tsx
		const activeFilterCount =
			colors.length +
			colorIdentity.length +
			(filterType.length > 0 ? 1 : 0) +
```

- [ ] **Step 3: Extend `handleApplyFilters`**

In the `handleApplyFilters` callback's parameter type, after `colorMatch: 'exact' | 'include' | 'atMost';` (line ~93), add:

```tsx
			colorIdentity: ScryfallColor[];
```

In its body, after `setColorMatch(f.colorMatch);` (line ~103), add:

```tsx
setColorIdentity(f.colorIdentity);
```

- [ ] **Step 4: Include in local `collectionFilters`**

In the `collectionFilters` useMemo (line ~136), after `colorMatch,`, add:

```tsx
			colorIdentity,
```

And add `colorIdentity,` to that useMemo's dependency array (line ~150).

- [ ] **Step 5: Compute the effective (intersected) color identity**

Just above the `scryfallFilters` object (before line ~193), add:

```tsx
// User's color-identity selection combines with the commander constraint (both are
// "at most" ci<= sets), so the effective allowance is their intersection.
const effectiveColorIdentity =
	colorIdentityFilter && colorIdentityFilter.length > 0
		? colorIdentity.length > 0
			? colorIdentity.filter((c) => colorIdentityFilter.includes(c))
			: colorIdentityFilter
		: colorIdentity;
```

(`colorIdentityFilter` is the commander constraint, defined line ~191.)

- [ ] **Step 6: Feed it to the Scryfall search**

In `scryfallFilters` (line ~193), replace:

```tsx
			colorIdentity: inCollectionOnly ? undefined : colorIdentityFilter,
```

with:

```tsx
			colorIdentity: inCollectionOnly
				? undefined
				: effectiveColorIdentity.length > 0
					? effectiveColorIdentity
					: undefined,
```

- [ ] **Step 7: Apply intersection to the in-collection local path**

The in-collection branch already narrows to the commander identity via the post-filter at lines ~163-167. The user's `colorIdentity` is already applied through `collectionFilters` (Step 4) → `filterCollectionCards` → the Task 5 matcher. No further change: commander narrowing (post-filter) AND user narrowing (`filterCollectionCards`) compose to the same intersection. Confirm both run by reading lines 157-180.

- [ ] **Step 8: Pass to FilterModal**

In the `<FilterModal ... />` (line ~371), after `colorMatch={colorMatch}` (line 374), add:

```tsx
colorIdentity = { colorIdentity };
```

- [ ] **Step 9: Verify**

Run: `npm run check`
Expected: PASS (all three FilterModal call sites now satisfied).

- [ ] **Step 10: Runtime check (finder, commander)**

`npm run dev` → open a Commander deck whose commander identity is e.g. {W,U}. Open Add Cards → Filtres → set Color identity to {U,B}. Expected: results are constrained to {U} (intersection of {W,U} and {U,B}) — never showing black cards. Set it to {G}: expect zero results (empty intersection). Clear it: results fall back to the full commander identity {W,U}. Toggle "In collection only" and repeat — same narrowing. In a non-commander deck (e.g. standard), the user selection applies directly with no commander constraint.

- [ ] **Step 11: Commit**

```bash
git add src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx
git commit -m "feat(deck-finder): color identity filter intersecting commander constraint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Final full-app verification

**Files:** none (verification only).

- [ ] **Step 1: Full check**

Run: `npm run check`
Expected: PASS, no errors.

- [ ] **Step 2: Cross-surface runtime smoke**

`npm run dev` and confirm in one pass:

- Search: `Legendary` in Type suggestions; `Colors (cost)` label; Color identity filters and persists via `ci=` URL param.
- Collection: sidebar Color identity narrows results; badge count includes it; Reset clears.
- Deck finder (commander): Color identity intersects commander identity; empty intersection ⇒ no results; token mode unaffected (no ci constraint applied to tokens).

- [ ] **Step 3: Confirm no console errors**

Watch the browser console during the smoke test — expect no new errors/warnings from the filter components.

---

## Self-Review Notes

- **Spec coverage:** Supertypes → Task 1. Color (cost) label → Task 2. Color Identity: state → Task 3; component → Task 4; local match → Task 5; FilterModal → Task 6; search → Task 7; collection → Task 8; finder + commander intersection → Task 9. Verification → Task 10. All spec sections mapped.
- **Type consistency:** field name `colorIdentity` and prop names (`selected`/`onChange`/`symbolMap`) are identical across Tasks 3, 4, 6, 7, 8, 9. `matchColorIdentity` signature matches its call in Task 5.
- **Ordering caveat:** Task 3 Step 4 touches `useSearchFiltersFromUrl.ts` which depends on state added in Task 7 — noted inline with a fallback (`colorIdentity: []`) to keep the build green if executed strictly in order. Executing Task 7 immediately after Task 3, or applying the fallback, both resolve it.
