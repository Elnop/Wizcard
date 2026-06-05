# Custom Card Badge + Unified Search List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rotating violet shimmer border to every custom card displayed in the UI, and merge the Search "Tout" mode into a single unified list instead of two separate sections.

**Architecture:** `AnyCard` is widened to include `CustomCard` directly (no more unsafe casts). A new `CustomCardBadge` overlay component renders the animated border. A `withCustomBadge` helper composes the badge with existing overlays at each call site. The Search page replaces its two `<CardList>` blocks with one, using a `mergedCards` memo.

**Tech Stack:** Next.js App Router, React, CSS Modules, TypeScript — no new dependencies.

---

## File Map

| File                                                                 | Action | Responsibility              |
| -------------------------------------------------------------------- | ------ | --------------------------- |
| `src/lib/card/components/CardList/CardList.types.ts`                 | Modify | Widen `AnyCard` union       |
| `src/lib/card/components/CustomCardBadge/CustomCardBadge.tsx`        | Create | Badge component             |
| `src/lib/card/components/CustomCardBadge/CustomCardBadge.module.css` | Create | Shimmer animation styles    |
| `src/lib/card/utils/composeOverlay.tsx`                              | Create | `withCustomBadge` helper    |
| `src/app/search/page.tsx`                                            | Modify | Merged list + badge overlay |
| `src/app/collection/page.tsx`                                        | Modify | Badge overlay               |
| `src/app/decks/[id]/page.tsx`                                        | Modify | Badge overlay               |
| `src/app/wishlist/page.tsx`                                          | Modify | Badge overlay               |

---

## Task 1: Widen `AnyCard` to include `CustomCard`

**Files:**

- Modify: `src/lib/card/components/CardList/CardList.types.ts`

Context: `AnyCard` is currently `ScryfallCard | Card`. `Card` is `(ScryfallCard | CustomCard) & { entry: CardEntry }` — so `CustomCard` without an entry is not assignable to `AnyCard`. This forces the `as unknown as CardListCards` cast in `search/page.tsx`. We fix this at the source.

- [ ] **Step 1: Update `CardList.types.ts`**

Open `src/lib/card/components/CardList/CardList.types.ts`. Replace the current imports and `AnyCard` definition:

```ts
import type { ReactNode, MouseEvent } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';
import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';

export type AnyCard = ScryfallCard | Card | CustomCard;
```

Everything below `AnyCard` in the file stays unchanged.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -60
```

Expected: errors may appear downstream (call sites that used the old cast). Note them — they'll be fixed in subsequent tasks. No new errors should be introduced by this change itself other than the now-redundant cast removal.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/components/CardList/CardList.types.ts
git commit -m "feat(types): widen AnyCard to include CustomCard"
```

---

## Task 2: Create `CustomCardBadge` component

**Files:**

- Create: `src/lib/card/components/CustomCardBadge/CustomCardBadge.module.css`
- Create: `src/lib/card/components/CustomCardBadge/CustomCardBadge.tsx`

The badge is an absolutely-positioned `<div>` that overlays the card image with a rotating conic-gradient border. The CSS mask trick (`mask-composite: exclude`) makes only the 2px border strip visible, keeping the card art fully visible underneath.

- [ ] **Step 1: Create the CSS file**

Create `src/lib/card/components/CustomCardBadge/CustomCardBadge.module.css`:

```css
@property --angle {
	syntax: '<angle>';
	inherits: false;
	initial-value: 0deg;
}

.badge {
	position: absolute;
	inset: 0;
	pointer-events: none;
	border-radius: 4.75% / 3.4%;
	padding: 2px;
	background: conic-gradient(
		from var(--angle),
		#7c3aed 0%,
		#a78bfa 20%,
		#c4b5fd 30%,
		#7c3aed 50%,
		#5b21b6 70%,
		#7c3aed 100%
	);
	-webkit-mask:
		linear-gradient(#fff 0 0) content-box,
		linear-gradient(#fff 0 0);
	-webkit-mask-composite: xor;
	mask-composite: exclude;
	animation: customShimmer 3s linear infinite;
	box-shadow: 0 0 8px 2px rgba(124, 58, 237, 0.45);
}

@keyframes customShimmer {
	to {
		--angle: 360deg;
	}
}
```

- [ ] **Step 2: Create the component**

Create `src/lib/card/components/CustomCardBadge/CustomCardBadge.tsx`:

```tsx
import { isCustomCard } from '@/lib/mpc/types';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import styles from './CustomCardBadge.module.css';

export function CustomCardBadge({ card }: { card: AnyCard }) {
	if (!isCustomCard(card)) return null;
	return <div className={styles.badge} aria-label="Carte custom" />;
}
```

Note: `isCustomCard` checks `card.object === 'custom_card'`. Since `AnyCard` now includes `CustomCard`, no cast is needed.

- [ ] **Step 3: Verify TypeScript compiles cleanly for this component**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | grep -E "CustomCardBadge|error" | head -20
```

Expected: no errors mentioning `CustomCardBadge`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/CustomCardBadge/
git commit -m "feat(badge): add CustomCardBadge with rotating violet shimmer border"
```

---

## Task 3: Create `withCustomBadge` overlay helper

**Files:**

- Create: `src/lib/card/utils/composeOverlay.tsx`

This helper wraps any existing overlay ReactNode with `CustomCardBadge` prepended. Pages call this instead of inlining the badge at every call site.

- [ ] **Step 1: Create the helper**

Create `src/lib/card/utils/composeOverlay.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CustomCardBadge } from '@/lib/card/components/CustomCardBadge/CustomCardBadge';

export function withCustomBadge(card: AnyCard, inner?: ReactNode): ReactNode {
	return (
		<>
			<CustomCardBadge card={card} />
			{inner}
		</>
	);
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | grep -E "composeOverlay|error" | head -20
```

Expected: no errors mentioning `composeOverlay`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/utils/composeOverlay.tsx
git commit -m "feat(badge): add withCustomBadge overlay composer"
```

---

## Task 4: Add badge to Search page + unify "Tout" mode list

**Files:**

- Modify: `src/app/search/page.tsx`

Two changes in one file:

1. Remove the `as unknown as CardListCards` cast (now safe since `AnyCard` includes `CustomCard`).
2. Replace the two separate `<CardList>` blocks (official + custom) with one unified list in mode `all`.
3. Add `renderOverlay` with `withCustomBadge` to the single list.

- [ ] **Step 1: Add imports**

At the top of `src/app/search/page.tsx`, add two imports after the existing import block:

```ts
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
```

- [ ] **Step 2: Add `mergedCards` memo**

Inside `SearchPageContent`, after the `filteredCustomCards` memo (around line 122), add:

```ts
const mergedCards: AnyCard[] = useMemo(() => {
	if (mode === 'all') return [...cards, ...filteredCustomCards];
	if (mode === 'custom') return filteredCustomCards;
	return cards;
}, [mode, cards, filteredCustomCards]);
```

- [ ] **Step 3: Update `showEmptyState`**

Replace the existing line:

```ts
const showEmptyState = showOfficial && !isDefaultQuery && !isLoading && cards.length === 0;
```

With:

```ts
const showEmptyState = !isDefaultQuery && !isLoading && !customLoading && mergedCards.length === 0;
```

- [ ] **Step 4: Replace the two `<CardList>` blocks with one**

In the JSX, remove the entire `{showOfficial && (...)}` block and the entire `{showCustom && (...)}` block. Replace both with:

```tsx
{
	!isDefaultQuery && !isLoading && mergedCards.length > 0 && (
		<div className={styles.resultInfo}>
			<span>
				Showing {cards.length > 0 ? `${cards.length} of ${totalCards.toLocaleString()} cards` : ''}
				{mode === 'all' && filteredCustomCards.length > 0
					? `${cards.length > 0 ? ' · ' : ''}${filteredCustomCards.length} custom`
					: ''}
			</span>
		</div>
	);
}

{
	isDefaultQuery && !isLoading && (
		<div className={styles.resultInfo}>
			<span>Cartes populaires EDH</span>
		</div>
	);
}

{
	error && (
		<div className={styles.error}>
			<p>An error occurred. Please try again.</p>
		</div>
	);
}

{
	queryError && (
		<div className={styles.queryError}>
			<p>{queryError.message}</p>
			{queryError.warnings.length > 0 && (
				<ul className={styles.queryWarnings}>
					{queryError.warnings.map((w) => (
						<li key={w}>{w}</li>
					))}
				</ul>
			)}
		</div>
	);
}

{
	showEmptyState && (
		<div className={styles.emptyState}>
			<h2>Start searching</h2>
			<p>Enter a card name or apply filters to find Magic: The Gathering cards.</p>
		</div>
	);
}

<CardList
	cards={mergedCards}
	isLoading={isLoading}
	isLoadingMore={isLoadingMore}
	hasMore={hasMore}
	onLoadMore={loadMore}
	onCardClick={handleCardClick}
	renderOverlay={(c) => withCustomBadge(c)}
	sortOrder={order}
	sortDir={dir}
	onSortChange={(newOrder, newDir) => {
		setOrder(newOrder as Parameters<typeof setOrder>[0]);
		setDir(newDir);
	}}
	pageSize={false}
	tableColumns={tableColumns}
/>;

{
	!isLoading && !isDefaultQuery && mergedCards.length === 0 && !error && (
		<div className={styles.noResults}>
			<h3>No cards found</h3>
			{suggestions.length > 0 ? (
				<>
					<p>Did you mean:</p>
					<ul className={styles.suggestions}>
						{suggestions.map((s) => (
							<li key={s}>
								<button type="button" className={styles.suggestionLink} onClick={() => setName(s)}>
									{s}
								</button>
							</li>
						))}
					</ul>
				</>
			) : (
				<p>Try adjusting your search or filters.</p>
			)}
		</div>
	);
}
```

- [ ] **Step 5: Remove now-unused variables**

Remove these variables that are no longer needed:

- `showOfficial` (line ~97)
- `showCustom` (line ~98)
- `customError` from the `useCustomCards` destructure (it was only used in the removed custom section)

Also remove the `customSectionHeader` and `customBadge` CSS classes from `page.module.css` if they exist (search for them in the CSS file and delete).

- [ ] **Step 6: Verify TypeScript and lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Expected: 0 errors. The `as unknown as CardListCards` cast is gone.

- [ ] **Step 7: Commit**

```bash
git add src/app/search/page.tsx
git commit -m "feat(search): unify 'Tout' mode into single list, add custom badge overlay"
```

---

## Task 5: Add badge to Collection page

**Files:**

- Modify: `src/app/collection/page.tsx`

The collection already has a `renderOverlay` that shows an `x{count}` badge. We wrap that existing output with `withCustomBadge`.

- [ ] **Step 1: Add import**

In `src/app/collection/page.tsx`, add after the existing imports:

```ts
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
```

- [ ] **Step 2: Update `renderOverlay`**

Find the existing `renderOverlay` prop on the `<CardList>` (around line 165):

```tsx
renderOverlay={(card) => {
	const stack = stackByCardId.get(card.id);
	const count = stack?.cards.length ?? 1;
	return count > 1 ? <span className={styles.cardBadge}>x{count}</span> : null;
}}
```

Replace with:

```tsx
renderOverlay={(card) => {
	const stack = stackByCardId.get(card.id);
	const count = stack?.cards.length ?? 1;
	const countBadge = count > 1 ? <span className={styles.cardBadge}>x{count}</span> : undefined;
	return withCustomBadge(card, countBadge);
}}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/collection/page.tsx
git commit -m "feat(collection): add custom card badge overlay"
```

---

## Task 6: Add badge to Deck page

**Files:**

- Modify: `src/app/decks/[id]/page.tsx`

The deck page has a complex `renderOverlay` callback that renders either a bulk-select checkbox or a `DeckCardOverlay`. We wrap both return paths with `withCustomBadge`.

Note: deck cards are `ResolvedDeckCard` (which extends `ScryfallCard` with `entry`), so in practice no deck card will be a custom card right now — the badge will simply never render for deck cards. But adding the hook now means it will work automatically when custom cards are supported in decks.

- [ ] **Step 1: Add import**

In `src/app/decks/[id]/page.tsx`, add after existing imports:

```ts
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
```

- [ ] **Step 2: Update `renderOverlay`**

Find `const renderOverlay = useCallback(` (around line 313). The callback currently has two return paths — the bulk-select div and the `<DeckCardOverlay>`. Wrap both return values:

```ts
const renderOverlay = useCallback(
	(card: AnyCard) => {
		const c = card as ResolvedDeckCard;
		const group = groupByCardId.get(c.oracle_id ?? c.id);
		const currentZone = getDeckZone(c.entry.tags);
		if (!group) return null;

		if (bulkSelectMode) {
			const checked = bulkSelected.has(c.oracle_id ?? c.id);
			return withCustomBadge(
				card,
				<div
					style={{
						position: 'absolute',
						inset: 0,
						pointerEvents: 'none',
						display: 'flex',
						alignItems: 'flex-start',
						justifyContent: 'flex-start',
						padding: '8px',
						background: checked ? 'rgba(124,106,245,0.18)' : 'transparent',
						border: checked ? '2px solid rgba(124,106,245,0.7)' : '2px solid transparent',
						borderRadius: '4px',
						boxSizing: 'border-box',
					}}
				>
					<input
						type="checkbox"
						checked={checked}
						readOnly
						style={{ width: 18, height: 18, cursor: 'pointer', pointerEvents: 'none' }}
					/>
				</div>
			);
		}

		const deckScryfallIds = Array.from(group.byZone.values())
			.flat()
			.map((rc) => rc.id);
		const collectionIds = oracleIdToAllScryfallIds.get(c.oracle_id ?? c.id);
		const oracleScryfallIds = Array.from(new Set([...deckScryfallIds, ...(collectionIds ?? [])]));

		const firstCopy = group.byZone.get(currentZone)?.[0];
		const isContextCard = contextMenuCard === card;
		return withCustomBadge(
			card,
			<DeckCardOverlay
				group={group}
				currentZone={currentZone}
				zones={zones}
				deckId={deckId}
				oracleScryfallIds={oracleScryfallIds}
				deckNameResolver={deckNameResolver}
				onDuplicate={handleDuplicateCard}
				onRemove={removeCardFromDeck}
				onChangeZone={changeZone}
				onBadgeClick={() =>
					handleCardGroupClickWithPrintPicker(group, firstCopy?.entry.rowId ?? c.entry.rowId)
				}
				onAddToWishlist={(scryfallId) => {
					addToWishlist({ id: scryfallId } as ScryfallCard);
				}}
				wishlistEntries={wishlistEntries}
				contextMenuPos={isContextCard ? contextMenuPos : null}
				onContextMenuClose={() => setContextMenuPos(null)}
			/>
		);
	},
	[
		groupByCardId,
		bulkSelectMode,
		bulkSelected,
		zones,
		deckId,
		deckNameResolver,
		oracleIdToAllScryfallIds,
		handleDuplicateCard,
		removeCardFromDeck,
		changeZone,
		handleCardGroupClickWithPrintPicker,
		addToWishlist,
		wishlistEntries,
		contextMenuCard,
		contextMenuPos,
	]
);
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/[id]/page.tsx
git commit -m "feat(deck): add custom card badge overlay"
```

---

## Task 7: Add badge to Wishlist page

**Files:**

- Modify: `src/app/wishlist/page.tsx`

The wishlist currently has no `renderOverlay`. We add one.

- [ ] **Step 1: Add import**

In `src/app/wishlist/page.tsx`, add after existing imports:

```ts
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
```

- [ ] **Step 2: Add `renderOverlay` to `<CardList>`**

Find the `<CardList>` component in the wishlist page JSX (around line 101). Add `renderOverlay`:

```tsx
<CardList
	cards={representativeCards}
	isLoading={isHydrating}
	onCardClick={(card) => {
		const stack = stackByCardId.get(card.id);
		if (stack) handleCardClick(stack);
	}}
	renderOverlay={(c) => withCustomBadge(c)}
	tableColumns={[
		{ key: 'name', label: 'Nom' },
		{
			key: 'set',
			label: 'Set',
			render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
		},
		{
			key: 'collector_number',
			label: 'Collector #',
			render: (card) => ('collector_number' in card ? (card.collector_number as string) : '—'),
		},
		{
			key: 'condition',
			label: 'Condition',
			render: (card) => ('entry' in card ? (card.entry.condition ?? '—') : '—'),
		},
		{
			key: 'foil',
			label: 'Foil',
			render: (card) => ('entry' in card ? (card.entry.foilType ?? '—') : '—'),
		},
		{
			key: 'prices',
			label: 'Prix USD',
			render: (card) =>
				'prices' in card && card.prices && 'usd' in card.prices ? (card.prices.usd ?? '—') : '—',
		},
	]}
/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 4: Final check — full type check + lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/app/wishlist/page.tsx
git commit -m "feat(wishlist): add custom card badge overlay"
```
