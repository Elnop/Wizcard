# Color Identity at-most/exact mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `atMost`/`exact` mode selector to the Color Identity filter so users can show only cards whose identity is exactly the selected colors (`ci=`), excluding colorless and partial-color cards.

**Architecture:** Add a `colorIdentityMatch: 'atMost' | 'exact'` modifier alongside the existing `colorIdentity` field. Thread it through the same path the color-identity filter already uses: shared type + its literal consumers, the `ColorIdentityFilter` UI (new radio group), the local matcher, the Scryfall query builder, the search hook + URL, `FilterModal`, and the collection/finder consumers. The deck finder's commander-intersection zero-condition is extended so `exact` also yields zero when the commander narrows the selection.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, CSS Modules.

## Global Constraints

- No test framework — verification is `npm run check` (TS + ESLint + Prettier, 0 errors) plus runtime. Never claim pass without running `npm run check`.
- Repo ESLint forbids nested ternaries (`sonarjs/no-nested-conditional`) — use if/else or extracted booleans.
- Mode values are exactly the string literals `'atMost'` and `'exact'`. Default is `'atMost'`.
- `colorIdentityMatch` is a MODIFIER, not a separate filter — it is NOT added to `countActiveFilters`.
- Color set is `W U B R G` (`MTG_COLORS`, `ScryfallColor`).
- Commit after each task, staging only that task's files (never `git add -A`). Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: `colorIdentityMatch` on shared filter state + all literal consumers

**Files:**

- Modify: `src/lib/search/types.ts` (`CardFilters`, `DEFAULT_CARD_FILTERS`)
- Modify: `src/lib/mpc/hooks/useCustomCards.ts` (default-param literal)
- Modify: `src/app/search/page.tsx` (`useCustomCards({...})` call literal)
- Modify: `src/app/search/useSearchFiltersFromUrl.ts` (`countActiveFilters({...})` literal)

**Interfaces:**

- Produces: `CardFilters.colorIdentityMatch: 'atMost' | 'exact'`; `DEFAULT_CARD_FILTERS.colorIdentityMatch = 'atMost'`. `CollectionFilters` inherits it via `extends`; `defaultCollectionFilters` inherits the default via spread. `countActiveFilters` is UNCHANGED.

This task batches the type change with every object-literal that builds a `CardFilters`/`CardFilters`-derived value, so the build stays green (learned from the prior feature: `UseCustomCardsFilters extends CardFilters` and the search-page/URL literals must be updated in lockstep).

- [ ] **Step 1: Add the field to `CardFilters`**

In `src/lib/search/types.ts`, the interface currently has:

```ts
export interface CardFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch: ColorMatch;
	colorIdentity: ScryfallColor[];
	type: string[];
```

Change to:

```ts
export interface CardFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch: ColorMatch;
	colorIdentity: ScryfallColor[];
	colorIdentityMatch: 'atMost' | 'exact';
	type: string[];
```

- [ ] **Step 2: Add the default**

In the same file:

```ts
export const DEFAULT_CARD_FILTERS: CardFilters = {
	name: '',
	colors: [],
	colorMatch: 'include',
	colorIdentity: [],
	type: [],
```

Change to:

```ts
export const DEFAULT_CARD_FILTERS: CardFilters = {
	name: '',
	colors: [],
	colorMatch: 'include',
	colorIdentity: [],
	colorIdentityMatch: 'atMost',
	type: [],
```

- [ ] **Step 3: `useCustomCards` default-param literal**

In `src/lib/mpc/hooks/useCustomCards.ts`, the default `filters` param object has `colorIdentity: [],`. Add the mode right after it:

```ts
		colorIdentity: [],
		colorIdentityMatch: 'atMost',
```

(Custom-cards filtering does not use color identity — this only satisfies the `UseCustomCardsFilters extends CardFilters` type.)

- [ ] **Step 4: `page.tsx` useCustomCards call literal**

In `src/app/search/page.tsx`, the `useCustomCards(...)` call's filters object contains `colorIdentity: [],` (a placeholder — custom cards don't filter by CI). Add right after it:

```tsx
			colorIdentity: [],
			colorIdentityMatch: 'atMost',
```

- [ ] **Step 5: `useSearchFiltersFromUrl` countActiveFilters literal**

In `src/app/search/useSearchFiltersFromUrl.ts`, the `countActiveFilters({...})` call currently passes `colorIdentity,`. Add the mode with the real state value that will exist after Task 5 — but Task 5 isn't done yet, so for now pass the literal to keep the build green:

```ts
		colorIdentity,
		colorIdentityMatch: 'atMost',
```

Task 5 will replace `'atMost'` here with the real `colorIdentityMatch` state variable.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: PASS (0 errors). If TS reports a missing `colorIdentityMatch` at any OTHER `CardFilters`-literal site not listed above, add `colorIdentityMatch: 'atMost'` there too and note it in the report.

- [ ] **Step 7: Commit**

```bash
git add src/lib/search/types.ts src/lib/mpc/hooks/useCustomCards.ts src/app/search/page.tsx src/app/search/useSearchFiltersFromUrl.ts
git commit -m "feat(filters): add colorIdentityMatch modifier to filter state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `ColorIdentityFilter` mode radio group

**Files:**

- Modify: `src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx`

**Interfaces:**

- Consumes: `styles.matchGroup` / `styles.matchOption` from the reused `ColorFilter.module.css` (already imported as `styles`).
- Produces: `ColorIdentityFilterProps` gains `colorIdentityMatch?: 'atMost' | 'exact'` and `onColorIdentityMatchChange?: (m: 'atMost' | 'exact') => void`. Radio group renders only when `selected.length > 0 && onColorIdentityMatchChange`.

- [ ] **Step 1: Extend props + render the radios**

Replace the entire file `src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx` with:

```tsx
'use client';

import type { ScryfallColor, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { MTG_COLORS } from '@/lib/mtg/colors';
import { useMultiSelect } from '@/lib/search/hooks/useMultiSelect';
import styles from '../ColorFilter/ColorFilter.module.css';

export type ColorIdentityMatch = 'atMost' | 'exact';

export interface ColorIdentityFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
	colorIdentityMatch?: ColorIdentityMatch;
	onColorIdentityMatchChange?: (match: ColorIdentityMatch) => void;
	symbolMap?: Record<string, ScryfallCardSymbol>;
}

const matchOptions: { value: ColorIdentityMatch; label: string }[] = [
	{ value: 'atMost', label: 'At most' },
	{ value: 'exact', label: 'Exactly' },
];

export function ColorIdentityFilter({
	selected,
	onChange,
	colorIdentityMatch = 'atMost',
	onColorIdentityMatchChange,
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
			{selected.length > 0 && onColorIdentityMatchChange && (
				<div className={styles.matchGroup} role="group" aria-label="Color identity matching mode">
					{matchOptions.map((opt) => (
						<label key={opt.value} className={styles.matchOption}>
							<input
								type="radio"
								name="colorIdentityMatch"
								value={opt.value}
								checked={colorIdentityMatch === opt.value}
								onChange={() => onColorIdentityMatchChange(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: PASS. (Component's new optional props are unused by callers so far — no consumer breakage.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx
git commit -m "feat(filters): add at-most/exact mode selector to ColorIdentityFilter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Local matcher honors the mode

**Files:**

- Modify: `src/lib/card/utils/filterCollectionCards.ts` (`matchColorIdentity` + its call site)

**Interfaces:**

- Consumes: `filters.colorIdentityMatch` (Task 1).
- Produces: `matchColorIdentity(cardColorIdentity, selected, mode)` — third param `mode: 'atMost' | 'exact'`.

- [ ] **Step 1: Update the matcher**

In `src/lib/card/utils/filterCollectionCards.ts`, replace the existing `matchColorIdentity` function (currently lines ~85-93):

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

with:

```ts
function matchColorIdentity(
	cardColorIdentity: ScryfallColor[] | undefined,
	selected: ScryfallColor[],
	mode: 'atMost' | 'exact'
): boolean {
	if (selected.length === 0) return true;
	const identity = cardColorIdentity ?? [];
	if (mode === 'exact') {
		// "Exactly" (ci=): card identity is the same set as the selection.
		return identity.length === selected.length && selected.every((c) => identity.includes(c));
	}
	// "At most" (ci<=): every color of the card's identity must be in the selection.
	return identity.every((c) => selected.includes(c));
}
```

- [ ] **Step 2: Pass the mode at the call site**

In the same file, the `cardMatchesFilters` call is (lines ~210-211):

```ts
if (!matchColorIdentity((card as ScryfallCard).color_identity, filters.colorIdentity)) return false;
```

Change to:

```ts
if (
	!matchColorIdentity(
		(card as ScryfallCard).color_identity,
		filters.colorIdentity,
		filters.colorIdentityMatch
	)
)
	return false;
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/utils/filterCollectionCards.ts
git commit -m "feat(filters): local color-identity matcher honors exact mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Scryfall query builder emits `ci=` for exact

**Files:**

- Modify: `src/lib/scryfall/utils/scryfall-query.ts` (`ScryfallQueryParams` + CI clause)

**Interfaces:**

- Produces: `ScryfallQueryParams.colorIdentityMatch?: 'atMost' | 'exact'`; CI clause emits `ci=` when `exact`, else `ci<=`.

- [ ] **Step 1: Add the param**

In `src/lib/scryfall/utils/scryfall-query.ts`, `ScryfallQueryParams` has `colorIdentity?: ScryfallColor[];`. Add right after it:

```ts
	colorIdentity?: ScryfallColor[];
	colorIdentityMatch?: 'atMost' | 'exact';
```

- [ ] **Step 2: Emit `ci=` vs `ci<=`**

The CI clause currently is (lines ~95-97):

```ts
if (params.colorIdentity && params.colorIdentity.length > 0) {
	parts.push(`ci<=${params.colorIdentity.join('')}`);
}
```

Change to:

```ts
if (params.colorIdentity && params.colorIdentity.length > 0) {
	const op = params.colorIdentityMatch === 'exact' ? '=' : '<=';
	parts.push(`ci${op}${params.colorIdentity.join('')}`);
}
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/utils/scryfall-query.ts
git commit -m "feat(scryfall): color-identity query supports exact (ci=) mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Search hook + URL + page thread the mode

**Files:**

- Modify: `src/lib/scryfall/hooks/useScryfallCardSearch.ts` (`SearchFilters` + buildQuery)
- Modify: `src/app/search/useSearchFiltersFromUrl.ts`
- Modify: `src/app/search/page.tsx`

**Interfaces:**

- Consumes: `buildScryfallQuery` `colorIdentityMatch` (Task 4); `FilterModal` `colorIdentityMatch` prop (Task 6 — passed here, wired in Task 6).
- Produces: `SearchFilters.colorIdentityMatch?: 'atMost' | 'exact'`; URL `cim` param; `colorIdentityMatch` returned from `useSearchFiltersFromUrl`.

Note: this task passes `colorIdentityMatch` to `<FilterModal>` in page.tsx before Task 6 makes it a prop, so page.tsx's `<FilterModal>` will TS-error until Task 6. That is expected; do Task 6 immediately after. (The hook + URL edits themselves are self-contained and green.)

- [ ] **Step 1: `SearchFilters` + buildQuery in the hook**

In `src/lib/scryfall/hooks/useScryfallCardSearch.ts`, `SearchFilters` has `colorIdentity?: ScryfallColor[];`. Add after it:

```ts
	colorIdentity?: ScryfallColor[];
	colorIdentityMatch?: 'atMost' | 'exact';
```

In the `buildQuery` useCallback, the `buildScryfallQuery({...})` call has `colorIdentity,`. Add after it:

```ts
				colorIdentity,
				colorIdentityMatch: filters.colorIdentityMatch,
```

Add `filters.colorIdentityMatch` to the `buildQuery` useCallback dependency array (after `colorIdentityKey,`):

```ts
			colorIdentityKey,
			filters.colorIdentityMatch,
```

- [ ] **Step 2: URL state in `useSearchFiltersFromUrl.ts`**

Add a validator near the other `VALID_*` sets (after `VALID_COLOR_MATCHES`):

```ts
const VALID_COLOR_IDENTITY_MATCHES = new Set(['atMost', 'exact']);
```

Add a parser near `parseColorMatch`:

```ts
function parseColorIdentityMatch(param: string | null): 'atMost' | 'exact' {
	if (param && VALID_COLOR_IDENTITY_MATCHES.has(param)) return param as 'atMost' | 'exact';
	return 'atMost';
}
```

Add state right after the `colorIdentity` useState (line ~107-109):

```ts
const [colorIdentityMatch, setColorIdentityMatch] = useState<'atMost' | 'exact'>(() =>
	parseColorIdentityMatch(searchParams.get('cim'))
);
```

Add to the local `SearchFilters` type (after `colorIdentity: ScryfallColor[];`):

```ts
colorIdentityMatch: 'atMost' | 'exact';
```

In the URL-sync effect, after the `ci` param line (`if (colorIdentity.length > 0) params.set('ci', colorIdentity.join(','));`), add:

```ts
if (colorIdentityMatch !== 'atMost') params.set('cim', colorIdentityMatch);
```

Add `colorIdentityMatch` to that effect's dependency array (after `colorIdentity,`).

In `applyFilters`, after `setColorIdentity(filters.colorIdentity);`, add:

```ts
setColorIdentityMatch(filters.colorIdentityMatch);
```

In the `countActiveFilters({...})` call, replace the `colorIdentityMatch: 'atMost'` placeholder (added in Task 1 Step 5) with the real state:

```ts
		colorIdentity,
		colorIdentityMatch,
```

In the returned object, after `colorIdentity,`, add:

```ts
		colorIdentityMatch,
```

- [ ] **Step 3: `page.tsx`**

Destructure `colorIdentityMatch` from `useSearchFiltersFromUrl()` (near `colorIdentity,`).

In the OFFICIAL `useScryfallCardSearch({...})` filters object, after `colorIdentity,`, add:

```tsx
			colorIdentity,
			colorIdentityMatch,
```

Pass to `<FilterModal>` — after `colorIdentity={colorIdentity}`, add:

```tsx
colorIdentityMatch = { colorIdentityMatch };
```

(Leave the `useCustomCards` call's `colorIdentityMatch: 'atMost'` literal from Task 1 as-is.)

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: the ONLY errors are the missing-`colorIdentityMatch`-prop at `<FilterModal>` call sites (page.tsx now passes it, so page.tsx errors; the prop is added in Task 6). Confirm no errors inside the hook or URL file. If only FilterModal-call-site errors remain, that's PASS for this task; do Task 6 next.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scryfall/hooks/useScryfallCardSearch.ts src/app/search/useSearchFiltersFromUrl.ts src/app/search/page.tsx
git commit -m "feat(search): thread colorIdentityMatch through hook, URL (cim), page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire the mode through `FilterModal`

**Files:**

- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx`

**Interfaces:**

- Consumes: `ColorIdentityFilter` `colorIdentityMatch`/`onColorIdentityMatchChange` (Task 2).
- Produces: `FilterModal` accepts `colorIdentityMatch: 'atMost' | 'exact'` prop and emits it in `onApply`.

- [ ] **Step 1: Prop on `FilterModalProps` + onApply payload**

In `src/lib/search/components/FilterModal/FilterModal.tsx`, `FilterModalProps` has `colorIdentity: ScryfallColor[];`. Add after it:

```tsx
	colorIdentity: ScryfallColor[];
	colorIdentityMatch: 'atMost' | 'exact';
```

In the `onApply` payload type, after `colorIdentity: ScryfallColor[];`, add:

```tsx
		colorIdentity: ScryfallColor[];
		colorIdentityMatch: 'atMost' | 'exact';
```

- [ ] **Step 2: `FilterModalContentProps` + destructure + draft state**

Add to `FilterModalContentProps` after `initialColorIdentity: ScryfallColor[];`:

```tsx
	initialColorIdentity: ScryfallColor[];
	initialColorIdentityMatch: 'atMost' | 'exact';
```

Destructure `initialColorIdentityMatch` in `FilterModalContent` params (near `initialColorIdentity,`).

Add draft state after `draftColorIdentity` (line ~132):

```tsx
const [draftColorIdentityMatch, setDraftColorIdentityMatch] = useState<'atMost' | 'exact'>(
	initialColorIdentityMatch
);
```

- [ ] **Step 3: Emit in `handleApply`**

In `handleApply`'s `onApply({...})`, after `colorIdentity: draftColorIdentity,`, add:

```tsx
			colorIdentity: draftColorIdentity,
			colorIdentityMatch: draftColorIdentityMatch,
```

- [ ] **Step 4: Reset**

In `handleReset`, inside the `if (variant !== 'backs')` block, after `setDraftColorIdentity([]);`, add:

```tsx
setDraftColorIdentityMatch('atMost');
```

- [ ] **Step 5: Pass to `<ColorIdentityFilter>`**

The current render is:

```tsx
<ColorIdentityFilter
	selected={draftColorIdentity}
	onChange={setDraftColorIdentity}
	symbolMap={symbolMap}
/>
```

Change to:

```tsx
<ColorIdentityFilter
	selected={draftColorIdentity}
	onChange={setDraftColorIdentity}
	colorIdentityMatch={draftColorIdentityMatch}
	onColorIdentityMatchChange={setDraftColorIdentityMatch}
	symbolMap={symbolMap}
/>
```

- [ ] **Step 6: Wrapper pass-through**

In the outer `FilterModal` function, destructure `colorIdentityMatch` from props (after `colorIdentity,`; give it a default: `colorIdentityMatch = 'atMost',`). In the `<FilterModalContent ... />` JSX, after `initialColorIdentity={colorIdentity}`, add:

```tsx
initialColorIdentity = { colorIdentity };
initialColorIdentityMatch = { colorIdentityMatch };
```

- [ ] **Step 7: Verify**

Run: `npm run check`
Expected: errors ONLY at the remaining `<FilterModal>` call sites that don't yet pass `colorIdentityMatch` — `CollectionFiltersBar`, `ImportSupportModals`, and `CardSearchPanel` (page.tsx already passes it from Task 5). Those are fixed in Tasks 7-8. No errors inside FilterModal.tsx. If so, PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/search/components/FilterModal/FilterModal.tsx
git commit -m "feat(filters): wire colorIdentityMatch through FilterModal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Collection consumers

**Files:**

- Modify: `src/app/collection/lib/CollectionView/CollectionFiltersBar/CollectionFiltersBar.tsx`
- Modify: `src/app/collection/lib/CollectionView/CollectionFiltersAside/CollectionFiltersAside.tsx`
- Modify: `src/app/collection/lib/ImportModal/components/ImportSupportModals.tsx`

**Interfaces:**

- Consumes: `FilterModal` `colorIdentityMatch` prop (Task 6); `ColorIdentityFilter` mode props (Task 2); `filters.colorIdentityMatch` (Task 1).

- [ ] **Step 1: `CollectionFiltersBar`**

Pass the prop to `<FilterModal>` — after `colorIdentity={filters.colorIdentity}`, add:

```tsx
				colorIdentityMatch={filters.colorIdentityMatch}
```

In the `onApply` handler, after `colorIdentity: applied.colorIdentity,`, add:

```tsx
						colorIdentityMatch: applied.colorIdentityMatch,
```

- [ ] **Step 2: `CollectionFiltersAside`**

The `<ColorIdentityFilter>` there currently is:

```tsx
<ColorIdentityFilter
	selected={filters.colorIdentity}
	onChange={(colorIdentity: ScryfallColor[]) => patch('colorIdentity', colorIdentity)}
	symbolMap={symbolMap}
/>
```

Change to:

```tsx
<ColorIdentityFilter
	selected={filters.colorIdentity}
	onChange={(colorIdentity: ScryfallColor[]) => patch('colorIdentity', colorIdentity)}
	colorIdentityMatch={filters.colorIdentityMatch}
	onColorIdentityMatchChange={(m) => patch('colorIdentityMatch', m)}
	symbolMap={symbolMap}
/>
```

- [ ] **Step 3: `ImportSupportModals`**

Pass the prop to `<FilterModal>` — after `colorIdentity={state.filters.colorIdentity}`, add:

```tsx
				colorIdentityMatch={state.filters.colorIdentityMatch}
```

(Its `onApply` already spreads `{ ...prev, ...applied }`, so no onApply change is needed.)

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: the ONLY remaining error is the missing `colorIdentityMatch` prop at `CardSearchPanel.tsx` (Task 8). No errors in the three touched files. If so, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/collection/lib/CollectionView/CollectionFiltersBar/CollectionFiltersBar.tsx src/app/collection/lib/CollectionView/CollectionFiltersAside/CollectionFiltersAside.tsx src/app/collection/lib/ImportModal/components/ImportSupportModals.tsx
git commit -m "feat(collection): color-identity exact mode in bar, sidebar, import

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Deck finder — exact mode + commander-narrowing zero condition

**Files:**

- Modify: `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`

**Interfaces:**

- Consumes: `FilterModal` `colorIdentityMatch` prop (Task 6); `SearchFilters.colorIdentityMatch` (Task 5); `CollectionFilters.colorIdentityMatch` (Task 1); local matcher exact mode (Task 3).
- Produces: finder honors exact mode on both paths; commander-narrowing yields zero in exact mode.

Current relevant code (lines ~208-243):

```tsx
const colorIdentityFilter = legalFilter && isCommanderFormat ? commanderColorIdentity : undefined;

let effectiveColorIdentity: ScryfallColor[];
if (colorIdentityFilter && colorIdentityFilter.length > 0) {
	effectiveColorIdentity =
		colorIdentity.length > 0
			? colorIdentity.filter((c) => colorIdentityFilter.includes(c))
			: colorIdentityFilter;
} else {
	effectiveColorIdentity = colorIdentity;
}
const colorIdentityToApply = effectiveColorIdentity.length > 0 ? effectiveColorIdentity : undefined;

const userCiDisjoint =
	!!colorIdentityFilter &&
	colorIdentityFilter.length > 0 &&
	colorIdentity.length > 0 &&
	effectiveColorIdentity.length === 0;
```

- [ ] **Step 1: Add `colorIdentityMatch` state**

After the existing `const [colorIdentity, setColorIdentity] = useState<ScryfallColor[]>([]);`, add:

```tsx
const [colorIdentityMatch, setColorIdentityMatch] = useState<'atMost' | 'exact'>('atMost');
```

- [ ] **Step 2: Extend `handleApplyFilters`**

Add to the callback's param type (after `colorIdentity: ScryfallColor[];`):

```tsx
			colorIdentity: ScryfallColor[];
			colorIdentityMatch: 'atMost' | 'exact';
```

Add to its body (after `setColorIdentity(f.colorIdentity);`):

```tsx
setColorIdentityMatch(f.colorIdentityMatch);
```

- [ ] **Step 3: Feed the local `collectionFilters`**

In the `collectionFilters` useMemo object, after `colorIdentity,`, add:

```tsx
			colorIdentity,
			colorIdentityMatch,
```

Add `colorIdentityMatch` to that useMemo's dependency array (after `colorIdentity,`).

- [ ] **Step 4: Rename the zero flag to `userCiImpossible` and extend it for exact**

Replace the `userCiDisjoint` block with:

```tsx
// The intersection shrank the user's selection: at least one selected color is outside
// the commander's identity. In exact mode this makes "exactly <selection>" impossible.
const commanderConstrained = !!colorIdentityFilter && colorIdentityFilter.length > 0;
const intersectionShrunk =
	commanderConstrained && colorIdentity.length !== effectiveColorIdentity.length;
// No card can satisfy the constraint: either the intersection is empty (at-most and exact),
// or exact mode was asked but the commander narrowed the selection.
const userCiImpossible =
	commanderConstrained &&
	colorIdentity.length > 0 &&
	(effectiveColorIdentity.length === 0 || (colorIdentityMatch === 'exact' && intersectionShrunk));
```

- [ ] **Step 5: Use the mode + new flag in `scryfallFilters`**

In `scryfallFilters`, change the two lines:

```tsx
			colorIdentity: inCollectionOnly ? undefined : colorIdentityToApply,
			matchNothing: inCollectionOnly ? false : userCiDisjoint,
```

to:

```tsx
			colorIdentity: inCollectionOnly ? undefined : colorIdentityToApply,
			colorIdentityMatch,
			matchNothing: inCollectionOnly ? false : userCiImpossible,
```

- [ ] **Step 6: In-collection zero path**

The line is currently:

```tsx
const inCollectionCards = userCiDisjoint ? [] : filteredCollectionCards;
```

Change to:

```tsx
const inCollectionCards = userCiImpossible ? [] : filteredCollectionCards;
```

- [ ] **Step 7: Pass to `<FilterModal>`**

After `colorIdentity={colorIdentity}`, add:

```tsx
colorIdentityMatch = { colorIdentityMatch };
```

- [ ] **Step 8: Verify**

Run: `npm run check`
Expected: FULLY clean (0 errors) — this is the last consumer. Watch for `sonarjs/no-nested-conditional` (the `userCiImpossible` expression uses `&&`/`||`, not nested ternaries — fine).

- [ ] **Step 9: Self-check the exact+commander cases by hand (in the report)**

Trace, with commander `{W,U}`:

- exact, user `{U}` → effective `{U}` (no shrink) → not impossible → `ci=U` + local exact `{U}`: mono-U only, both paths.
- exact, user `{U,G}` → effective `{U}` (shrunk) → `userCiImpossible` → zero both paths.
- atMost, user `{U,G}` → effective `{U}` (shrunk) but NOT exact → not impossible → `ci<=U`: at-most-U (incl. colorless).
- atMost, user `{G}` → effective `{}` → impossible (empty) → zero (unchanged).

- [ ] **Step 10: Commit**

```bash
git add src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx
git commit -m "feat(deck-finder): color-identity exact mode with commander-narrowing zero

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full check**

Run: `npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 2: Runtime smoke (`npm run dev`)**

- Search: Color identity {U}, mode `Exactly` → colorless cards gone, only mono-U identity; URL gains `cim=exact`; switch to `At most` → colorless return; Reset clears colors and mode (no `cim`).
- Collection sidebar: mode radios appear when a color is selected; `Exactly` narrows results.
- Commander deck finder ({W,U} commander): `Exactly {U}` → mono-U only on both tabs; `Exactly {U,G}` → zero on both tabs; `At most {U}` → prior behavior.

- [ ] **Step 3: Console clean**

No new console errors/warnings from the filter components during the smoke test.

---

## Self-Review Notes

- **Spec coverage:** state → Task 1; UI radios → Task 2; local matcher → Task 3; query `ci=` → Task 4; hook+URL+page → Task 5; FilterModal → Task 6; collection consumers (incl. ImportSupportModals) → Task 7; deck finder + exact-narrowing zero → Task 8; verify → Task 9. All spec sections mapped.
- **Type consistency:** `colorIdentityMatch: 'atMost' | 'exact'` used identically everywhere; `ColorIdentityMatch` type alias exported from the component; matcher's 3rd param and the `userCiImpossible`/`intersectionShrunk`/`commanderConstrained` names are consistent within Task 8.
- **Build-green ordering:** Task 1 batches the type change with ALL its literal consumers (lesson from the prior feature). Task 5 passes the FilterModal prop before Task 6 defines it (noted inline; Task 6 follows immediately). `countActiveFilters` unchanged since the mode is a modifier.
- **No placeholders:** every code step shows the exact edit.
