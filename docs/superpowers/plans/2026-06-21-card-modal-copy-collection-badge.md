# Card Modal Copy Collection Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a per-copy collection-state badge (owned ✓ / wishlist 🛒 / none grey) on the copies in `CardModal`'s by-zone lists, reusing the deck-page badge's look via a shared `OwnershipBadge` component, with the grey badge opening the existing add-to-collection confirmation for that copy.

**Architecture:** Extract the deck badge's presentational pill (class map + text + `<span>` + pill CSS) into a shared `OwnershipBadge` component; `DeckCardOverlay` migrates onto it (keeping its rich aggregate tooltip as children). A pure `getCopyBadgeState(copy, wishlistScryfallIds)` computes the single-copy state. `CardModal` stays decoupled via an optional `renderCopyBadge` render-prop, threaded down to `CopyCardOverlay` which renders it as an overlay element. `DeckDetailOwnerView` supplies the render-prop using `OwnershipBadge` + its wishlist data, wiring the grey badge to the existing `onAddToCollectionFromEntry`.

**Tech Stack:** Next.js (app router), React, TypeScript, CSS Modules. No test runner / no tests added (project removed tests for this feature series). Verification is `npm run check` (tsc + eslint + prettier) + manual smoke.

## Global Constraints

- Run `npm run check` (tsc + eslint + prettier) before every commit; it must pass.
- Do NOT add tests.
- `CardModal` (`src/lib/card/components/CardModal/CardModal.tsx`) stays generic/decoupled: it must NOT import `useCollectionContext`, `useWishlistContext`, `OwnershipBadge`, `getCopyBadgeState`, or any deck-specific module. It only gains a `renderCopyBadge?: (copy: Card) => React.ReactNode` prop and passes the rendered node down.
- Reuse the existing `BadgeState` type (`src/app/decks/[id]/components/DeckCardOverlay/useCollectionBadge.ts`) — do not define a new state union.
- Reuse the existing add path: the grey copy badge calls `onAddToCollectionFromEntry([copy.entry.rowId])` (already wired to open `AddCardToCollectionModal` in `DeckDetailOwnerView`). Do NOT create a new add path.
- French UI; per-copy badge has NO rich tooltip (the aggregate collection/wishlist tooltip stays deck-page only).
- No visual regression on the deck page after the `OwnershipBadge` extraction.

---

## File Structure

- Create: `src/lib/card/components/OwnershipBadge/OwnershipBadge.tsx` — shared presentational badge pill (state → class/text → `<span>`).
- Create: `src/lib/card/components/OwnershipBadge/OwnershipBadge.module.css` — the pill classes moved from `DeckCardOverlay.module.css`.
- Create: `src/lib/card/components/OwnershipBadge/copyBadgeState.ts` — pure `getCopyBadgeState`.
- Modify: `src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx` — render `OwnershipBadge` instead of inline JSX; tooltip passed as children.
- Modify: `src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.module.css` — remove the moved pill classes; rewrite the hover rule onto a wrapper class.
- Modify: `src/lib/card/components/CardModal/CopyCardOverlay.tsx` (+ `.module.css`) — accept and render an optional `collectionBadge` node.
- Modify: `src/lib/card/components/CardModal/CardModal.tsx` — add `renderCopyBadge` prop (3 interfaces + pass-down) and feed it to `CopyCardOverlay`.
- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx` — supply `renderCopyBadge` using `OwnershipBadge` + `getCopyBadgeState` + wishlist scryfallId set; grey → `onAddToCollectionFromEntry`.

---

## Task 1: Shared `OwnershipBadge` component (extracted, deck migrated onto it)

This task extracts the presentational pill into a shared component AND migrates `DeckCardOverlay` onto it in the same task — they share the CSS being moved, so a reviewer can't approve one without the other. Deliverable: deck page looks identical, badge logic lives in one place.

**Files:**

- Create: `src/lib/card/components/OwnershipBadge/OwnershipBadge.tsx`
- Create: `src/lib/card/components/OwnershipBadge/OwnershipBadge.module.css`
- Modify: `src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx`
- Modify: `src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.module.css`

**Interfaces:**

- Consumes: `BadgeState` from `@/app/decks/[id]/components/DeckCardOverlay/useCollectionBadge`.
- Produces:

  ```ts
  type OwnershipBadgeProps = {
  	badgeState: BadgeState;
  	ownedCount?: number; // used only for 'partial' text
  	neededCount?: number; // used for 'partial'/'locked' text
  	onClick?: () => void;
  	className?: string; // extra class on the pill (e.g. deck wrapper hook)
  	children?: React.ReactNode; // optional tooltip content rendered inside the pill
  };
  export function OwnershipBadge(props: OwnershipBadgeProps): JSX.Element;
  ```

  Text rules (moved verbatim from current `getBadgeText`): `partial` → `"{ownedCount}/{neededCount}"`; `locked` → `"0/{neededCount}"`; `owned` → `"✓"`; `wishlist` → `"🛒"`; else `""`.
  Class rules (moved from current `BADGE_CLASS_MAP`): owned→Green, partial→Orange, locked→Locked, wishlist→Wishlist, else→Grey.

- [ ] **Step 1: Create the shared CSS module**

Create `src/lib/card/components/OwnershipBadge/OwnershipBadge.module.css` with the pill classes (copied verbatim from `DeckCardOverlay.module.css` lines 27-71):

```css
.ownershipBadge {
	position: absolute;
	top: -9px;
	left: 50%;
	transform: translateX(-50%);
	min-width: 18px;
	height: 18px;
	padding: 0 4px;
	border-radius: 9px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 10px;
	font-weight: 700;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
	pointer-events: auto;
	z-index: 2;
	white-space: nowrap;
	cursor: default;
}

.ownershipBadgeGreen {
	background: rgba(74, 140, 111, 0.92);
	color: #fff;
}

.ownershipBadgeOrange {
	background: rgba(201, 168, 76, 0.92);
	color: #0b0c10;
}

.ownershipBadgeGrey {
	background: rgba(120, 120, 120, 0.55);
	color: transparent;
}

.ownershipBadgeLocked {
	background: rgba(201, 120, 50, 0.92);
	color: #fff;
}

.ownershipBadgeWishlist {
	background: rgba(100, 120, 220, 0.92);
	color: #fff;
}
```

- [ ] **Step 2: Create the `OwnershipBadge` component**

Create `src/lib/card/components/OwnershipBadge/OwnershipBadge.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { BadgeState } from '@/app/decks/[id]/components/DeckCardOverlay/useCollectionBadge';
import styles from './OwnershipBadge.module.css';

const BADGE_CLASS_MAP: Record<string, string> = {
	owned: styles.ownershipBadgeGreen,
	partial: styles.ownershipBadgeOrange,
	locked: styles.ownershipBadgeLocked,
	wishlist: styles.ownershipBadgeWishlist,
};

const BADGE_TEXT_STATIC: Record<string, string> = { owned: '✓', wishlist: '🛒' };

function getBadgeText(badgeState: BadgeState, ownedCount: number, neededCount: number): string {
	if (badgeState === 'partial') return `${ownedCount}/${neededCount}`;
	if (badgeState === 'locked') return `0/${neededCount}`;
	return BADGE_TEXT_STATIC[badgeState] ?? '';
}

type OwnershipBadgeProps = {
	badgeState: BadgeState;
	ownedCount?: number;
	neededCount?: number;
	onClick?: () => void;
	className?: string;
	children?: ReactNode;
};

export function OwnershipBadge({
	badgeState,
	ownedCount = 0,
	neededCount = 0,
	onClick,
	className,
	children,
}: OwnershipBadgeProps) {
	const badgeClass = BADGE_CLASS_MAP[badgeState] ?? styles.ownershipBadgeGrey;
	const text = getBadgeText(badgeState, ownedCount, neededCount);
	return (
		<span
			className={[styles.ownershipBadge, badgeClass, className].filter(Boolean).join(' ')}
			onClick={
				onClick
					? (e) => {
							e.stopPropagation();
							onClick();
						}
					: undefined
			}
			style={onClick ? { cursor: 'pointer' } : undefined}
		>
			{text}
			{children}
		</span>
	);
}
```

- [ ] **Step 3: Migrate `DeckCardOverlay.tsx` onto the component**

In `DeckCardOverlay.tsx`:

1. Remove the now-moved constants/helper: delete `BADGE_CLASS_MAP` (lines 19-24), `BADGE_TEXT_STATIC` (line 26), and `getBadgeText` (lines 28-31, including its closing brace/lines through the function end). Verify by reading the file — the function spans roughly lines 28-32.
2. Remove the now-unused locals computed from them: `const badgeClass = ...` and `const badgeText = ...` (search for `BADGE_CLASS_MAP[badgeState]` and `getBadgeText(`).
3. Add the import near the other imports (after line 8):

```ts
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
```

4. Replace the badge `<span className={`${styles.ownershipBadge} ${badgeClass}`} ...>` ... `</span>` block (currently lines ~205-245, the outer ownership badge span including its tooltip children) with an `OwnershipBadge` that receives the tooltip as children and a wrapper class for hover:

```tsx
<OwnershipBadge
	badgeState={badgeState}
	ownedCount={ownedCount}
	neededCount={neededCount}
	onClick={handleBadgeClick}
	className={styles.deckBadgeHover}
>
	<span className={styles.ownershipTooltip}>
		{/* ... keep the existing tooltip JSX exactly as-is ... */}
	</span>
</OwnershipBadge>
```

Keep the entire existing tooltip inner JSX (the `tooltipCopies`/`wishlistTooltipCopies`/"Pas dans ma collection" blocks) verbatim inside that `<span className={styles.ownershipTooltip}>`. Only the outer pill `<span>` is replaced by `OwnershipBadge`.

Note: `handleBadgeClick` may be `undefined` for non-`none` states without `onAddToCollectionClick`; `OwnershipBadge` already treats an undefined `onClick` as non-clickable. The previous code called `handleBadgeClick?.()` inside its own onClick and did `e.stopPropagation()`; `OwnershipBadge` does the `stopPropagation()` + call for us, so passing `onClick={handleBadgeClick}` preserves behavior.

- [ ] **Step 4: Update `DeckCardOverlay.module.css`**

1. Delete the moved pill classes from `DeckCardOverlay.module.css`: `.ownershipBadge` (lines 27-46), `.ownershipBadgeGreen`, `.ownershipBadgeOrange`, `.ownershipBadgeGrey`, `.ownershipBadgeLocked`, `.ownershipBadgeWishlist` (lines 48-71). Keep everything else (`.countBadge`, `.overlay`, all `.ownershipTooltip*` classes).
2. The old hover rule `.ownershipBadge:hover .ownershipTooltip` (lines 128-130) references the now-moved `.ownershipBadge` class, which no longer exists in this module. Replace it with a rule keyed on the wrapper class added in Step 3:

```css
.deckBadgeHover:hover .ownershipTooltip {
	display: flex;
}
```

(`OwnershipBadge` applies `className` onto the same pill `<span>` that contains the tooltip, so `.deckBadgeHover:hover .ownershipTooltip` is a valid descendant selector within this module.)

- [ ] **Step 5: Run repo check**

Run: `npm run check`
Expected: passes (tsc + eslint + prettier). If eslint flags an unused import/var (e.g. a leftover `badgeClass`), remove it.

- [ ] **Step 6: Manual smoke (report result)**

Run `npm run dev`, open a deck. Confirm each card's ownership badge looks identical to before (green ✓ / orange n/m / grey / locked / wishlist) and that hovering still shows the collection/wishlist tooltip. State the observed result.

- [ ] **Step 7: Commit**

```bash
git add src/lib/card/components/OwnershipBadge/ "src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx" "src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.module.css"
git commit -m "refactor(card): extract shared OwnershipBadge component"
```

---

## Task 2: Pure `getCopyBadgeState`

**Files:**

- Create: `src/lib/card/components/OwnershipBadge/copyBadgeState.ts`

**Interfaces:**

- Consumes: `BadgeState` (same import as Task 1); `Card` from `@/types/cards`.
- Produces:

  ```ts
  export function getCopyBadgeState(
  	copy: Card,
  	wishlistScryfallIds: ReadonlySet<string>
  ): BadgeState;
  ```

  Returns `'owned'` if `copy.entry.ownerId != null`; else `'wishlist'` if `wishlistScryfallIds.has(copy.id)`; else `'none'`.

- [ ] **Step 1: Create the helper**

Create `src/lib/card/components/OwnershipBadge/copyBadgeState.ts`:

```ts
import type { BadgeState } from '@/app/decks/[id]/components/DeckCardOverlay/useCollectionBadge';
import type { Card } from '@/types/cards';

/**
 * Badge state for a single deck copy (not a group):
 * owned if this copy is owned, else wishlist if its print is wishlisted, else none.
 */
export function getCopyBadgeState(
	copy: Card,
	wishlistScryfallIds: ReadonlySet<string>
): BadgeState {
	if (copy.entry.ownerId != null) return 'owned';
	if (wishlistScryfallIds.has(copy.id)) return 'wishlist';
	return 'none';
}
```

- [ ] **Step 2: Run repo check**

Run: `npm run check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/components/OwnershipBadge/copyBadgeState.ts
git commit -m "feat(card): add getCopyBadgeState helper for per-copy badge"
```

---

## Task 3: `CopyCardOverlay` + `CardModal` accept and render a copy badge

**Files:**

- Modify: `src/lib/card/components/CardModal/CopyCardOverlay.tsx`
- Modify: `src/lib/card/components/CardModal/CopyCardOverlay.module.css`
- Modify: `src/lib/card/components/CardModal/CardModal.tsx`

**Interfaces:**

- Consumes: nothing new (generic).
- Produces:
  - `CopyCardOverlay` gains `collectionBadge?: React.ReactNode`.
  - `CardModal` gains `renderCopyBadge?: (copy: Card) => React.ReactNode` (threaded through `Props`, `InnerProps`, outer destructure, pass-down to `CardModalInner`, inner destructure), supplied to `CopyCardOverlay` in `renderCopyOverlay` as `collectionBadge={renderCopyBadge?.(card)}`.

**Context (current code):**

- `CopyCardOverlay` props type at lines 15-26; destructure at 28-39; the `.overlay` root `<div>` at line 65; the metadata `.badges` div at lines 68-74.
- `CopyCardOverlay.module.css`: `.overlay` (absolute, `inset: 0`) at lines 1-6; `.badges` (absolute) at line 13.
- `CardModal.tsx`: `Props` (line ~72 area), `InnerProps` (line ~96 area), inner destructure (~313), `renderCopyOverlay` (~479-498 builds `<CopyCardOverlay .../>`), outer `CardModal` destructure (~886), pass-down to `CardModalInner` (~937).

- [ ] **Step 1: Add `collectionBadge` to `CopyCardOverlay` props**

In `CopyCardOverlay.tsx`, add to the `Props` type (after `card: Card;` at line 16):

```ts
	collectionBadge?: React.ReactNode;
```

And destructure it (after `card,` at line 29):

```ts
	collectionBadge,
```

Add the React import for the type if not present — `CopyCardOverlay.tsx` currently imports from `'react'` at line 1 (`useEffect, useCallback`); change that import to also bring the type:

```ts
import { useEffect, useCallback, type ReactNode } from 'react';
```

and use `collectionBadge?: ReactNode;` instead of `React.ReactNode` to match.

- [ ] **Step 2: Render the badge in the overlay**

In `CopyCardOverlay.tsx`, inside the root `<div className={...overlay...}>` (line 65), render the badge as the first child (it positions itself absolutely via `OwnershipBadge`'s own CSS, top-center):

```tsx
		<div className={`${styles.overlay} ${isSelected ? styles.selected : ''}`}>
			{collectionBadge}
			{/* Metadata badges always visible */}
			<div className={styles.badges}>
```

(`OwnershipBadge` is absolutely positioned `top: -9px; left: 50%`, and `.overlay` is `position: absolute; inset: 0`, so the badge sits at the top-center of each copy tile, clear of the bottom-left `.badges`. No CSS change needed in `CopyCardOverlay.module.css`; the badge's `pointer-events: auto` lets the grey one be clickable while `.overlay` stays `pointer-events: none`.)

- [ ] **Step 3: Thread `renderCopyBadge` through `CardModal` `Props` and `InnerProps`**

In `CardModal.tsx`, add to the `Props` interface (near `onAddToCollectionFromEntry?` ~line 72):

```ts
	renderCopyBadge?: (copy: Card) => React.ReactNode;
```

And the same line to the `InnerProps` interface (near its `onAddToCollectionFromEntry?` ~line 96).

- [ ] **Step 4: Destructure in inner + outer, pass down**

1. Inner `CardModalInner` destructure (~line 313, after `onAddToCollectionFromEntry,`):

```ts
	renderCopyBadge,
```

2. Outer `CardModal` destructure (~line 886, after `onAddToCollectionFromEntry,`):

```ts
	renderCopyBadge,
```

3. Pass-down to `CardModalInner` (~line 937, after `onAddToCollectionFromEntry={onAddToCollectionFromEntry}`):

```tsx
renderCopyBadge = { renderCopyBadge };
```

- [ ] **Step 5: Feed it to `CopyCardOverlay` in `renderCopyOverlay`**

In `renderCopyOverlay` (~line 485, the `<CopyCardOverlay ... />`), add the prop:

```tsx
				<CopyCardOverlay
					card={card}
					collectionBadge={renderCopyBadge?.(card)}
					isSelected={card.entry.rowId === selectedRowId}
					...
```

And add `renderCopyBadge` to the `renderCopyOverlay` `useCallback` dependency array (it currently lists `selectedRowId`, etc. near line 499).

- [ ] **Step 6: Run repo check**

Run: `npm run check`
Expected: passes. No existing consumer passes `renderCopyBadge` (optional), so other `CardModal` usages still type-check and render no copy badge.

- [ ] **Step 7: Commit**

```bash
git add src/lib/card/components/CardModal/CopyCardOverlay.tsx src/lib/card/components/CardModal/CopyCardOverlay.module.css src/lib/card/components/CardModal/CardModal.tsx
git commit -m "feat(card-modal): support per-copy collection badge via renderCopyBadge"
```

---

## Task 4: Wire `renderCopyBadge` in `DeckDetailOwnerView`

**Files:**

- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx`

**Interfaces:**

- Consumes: `OwnershipBadge` (Task 1), `getCopyBadgeState` (Task 2), `CardModal`'s `renderCopyBadge` prop (Task 3); existing `wishlistEntries` (line 145) and the already-wired `onAddToCollectionFromEntry` handler on the first `<CardModal>`.
- Produces: end-user behaviour. Terminal task.

**Context (current code):**

- `useWishlistContext()` destructure at line 145 exposes `entries: wishlistEntries`.
- The first `<CardModal>` (the deck-detail one) is around lines 667-688 and already has `onAddToCollectionFromEntry={(rowIds) => { ...opens AddCardToCollectionModal... }}`.
- `useMemo` is already imported (line 3).

- [ ] **Step 1: Add imports**

After the existing `buildCollectionAddRequest` import (added by the prior feature) / near the component imports (e.g. after line 32's `AddCardToCollectionModal` import), add:

```ts
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
import { getCopyBadgeState } from '@/lib/card/components/OwnershipBadge/copyBadgeState';
```

- [ ] **Step 2: Compute the wishlist scryfallId set**

Near the other derived memos (e.g. after the `oracleIdToAllScryfallIds` memo, ~line 245), add:

```ts
const wishlistScryfallIds = useMemo(
	() => new Set(wishlistEntries.map((e) => e.scryfallId)),
	[wishlistEntries]
);
```

- [ ] **Step 3: Pass `renderCopyBadge` to the deck-detail `CardModal`**

On the first `<CardModal>` (the one with `onAddToCollectionFromEntry`, ~line 680), add the prop:

```tsx
				renderCopyBadge={(copy) => {
					const state = getCopyBadgeState(copy, wishlistScryfallIds);
					return (
						<OwnershipBadge
							badgeState={state}
							onClick={
								state === 'none'
									? () => {
											const card = selectedCards?.[0];
											if (!card) return;
											const oracleScryfallIds = Array.from(
												oracleIdToAllScryfallIds.get(card.oracle_id ?? card.id) ??
													new Set<string>([card.id])
											);
											const req = buildCollectionAddRequest(
												card.name,
												[copy],
												oracleScryfallIds,
												wishlistEntries
											);
											if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
										}
									: undefined
							}
						/>
					);
				}}
```

Rationale: the grey badge must open the SAME `AddCardToCollectionModal`. Rather than route through `onAddToCollectionFromEntry` (which rebuilds from `selectedCards`), build the request directly for this one copy and set `pendingCollectionAdd` (the state and `buildCollectionAddRequest`/`setPendingCollectionAdd`/`oracleIdToAllScryfallIds` all already exist from the prior feature). This adds exactly one unowned copy to the modal.

- [ ] **Step 4: Run repo check**

Run: `npm run check`
Expected: passes.

- [ ] **Step 5: Manual smoke (report result)**

Run `npm run dev`, open a deck you own, open a card's detail modal:

1. Each copy in the by-zone lists shows a badge: ✓ green if that copy is owned, 🛒 if the print is wishlisted and not owned, grey otherwise.
2. Click a grey copy badge → the `AddCardToCollectionModal` confirmation opens for that single copy; confirming marks it owned.
3. Owned (✓) and wishlist (🛒) badges are not clickable.
4. The deck page's own aggregate badge is unchanged.
   State the observed result for each.

- [ ] **Step 6: Commit**

```bash
git add "src/app/decks/[id]/DeckDetailOwnerView.tsx"
git commit -m "feat(deck): show per-copy collection badge in card detail modal"
```

---

## Self-Review Notes

- **Spec coverage:** shared `OwnershipBadge` + deck migration (Task 1); `getCopyBadgeState` (Task 2); `CardModal` decoupled `renderCopyBadge` + `CopyCardOverlay` rendering (Task 3); `DeckDetailOwnerView` wiring with grey→confirmation-modal (Task 4). Per-copy semantics owned/wishlist/none (Task 2); no `partial`/`locked` for copies (Task 2 never returns them); no rich tooltip per copy (Task 4 passes no children); no new add path (Task 4 reuses `buildCollectionAddRequest`/`setPendingCollectionAdd`); no tests (none added).
- **Decoupling:** `CardModal` imports nothing deck/collection-specific — only gains a render-prop (Task 3). `OwnershipBadge`/`getCopyBadgeState` live under `src/lib/card/components/` (shared), importing only the `BadgeState` type.
- **Type consistency:** `BadgeState` reused everywhere; `OwnershipBadgeProps` (Task 1) matches usage in Task 4; `getCopyBadgeState(copy, wishlistScryfallIds)` signature (Task 2) matches the Task 4 call; `renderCopyBadge?: (copy: Card) => React.ReactNode` identical across `Props`/`InnerProps`/usage.
- **CSS hover risk addressed:** the `.ownershipBadge:hover .ownershipTooltip` descendant selector is rewritten to `.deckBadgeHover:hover .ownershipTooltip` keyed on a wrapper class `OwnershipBadge` applies to the same span (Task 1 Steps 3-4), since the pill class moved modules.
- **Verification:** `npm run check` per task + manual smoke on Tasks 1 and 4 (the two with visible UI changes).
