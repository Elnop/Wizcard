# Deck Collection Confirmation Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every "add a deck card to the collection" entry point (grey badge, right-click menu, detail modal) through the existing `AddCardToCollectionModal` confirmation instead of adding directly.

**Architecture:** A single pure helper builds the modal request `{ cardName, unownedRowIds, wishlistRowIds }` from a card + wishlist entries + the oracle's scryfallId set. `DeckCardOverlay` (badge + context menu) and `DeckDetailOwnerView`'s `CardModal` callback both produce that request and set one shared `pendingCollectionAdd` state in `DeckDetailOwnerView`, which renders the modal. On confirm, the view calls `toggleOwned`/`removeFromWishlist`. Removing from collection (un-own) in `CardModal` gets its own callback and stays direct.

**Tech Stack:** Next.js (app router), React, TypeScript, Zustand stores via context. No React test runner exists in this repo — pure logic is tested with standalone `tsx` scripts (the existing pattern, e.g. `src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts`, run via `npx tsx <file>`). UI wiring is verified by `npm run check` (tsc strict mode catches the prop-signature threading) plus manual smoke.

## Global Constraints

- Run `npm run check` (tsc + eslint + prettier) before every commit; it must pass.
- Reuse the existing `AddCardToCollectionModal` component unchanged (`src/app/decks/[id]/components/AddCardToCollectionModal/AddCardToCollectionModal.tsx`). Do NOT modify it.
- `CardModal` (`src/lib/card/components/CardModal/CardModal.tsx`) is a generic shared component: it must NOT import `AddCardToCollectionModal`. It only gains callback props.
- French UI copy, matching existing strings ("Ajouter à la collection", "Retirer de la collection").
- Pure-logic tests use the repo pattern: a `.test.ts` file with a local `check(name, cond)` helper, `console.log` PASS/FAIL, `process.exit(1)` on failure; run with `npx tsx <file>`.

---

## File Structure

- Create: `src/app/decks/[id]/collectionAddRequest.ts` — pure helper `buildCollectionAddRequest(...)` + `CollectionAddRequest` type.
- Create: `src/app/decks/[id]/collectionAddRequest.test.ts` — tsx-script test for the helper.
- Modify: `src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx` — change `onAddToCollectionClick` signature; pass request from badge AND context menu.
- Modify: `src/lib/card/components/CardModal/CardModal.tsx` — add `onRemoveFromCollectionEntry` prop (threaded through 3 interfaces + pass-down); split the per-copy toggle button into add vs remove.
- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx` — own `pendingCollectionAdd` state; render `AddCardToCollectionModal`; wire all three entry points; add `removeFromWishlist` to the wishlist context destructure.

---

## Task 1: Pure helper `buildCollectionAddRequest`

**Files:**

- Create: `src/app/decks/[id]/collectionAddRequest.ts`
- Test: `src/app/decks/[id]/collectionAddRequest.test.ts`

**Interfaces:**

- Consumes: nothing (leaf utility).
- Produces:

  ```ts
  export type CollectionAddRequest = {
  	cardName: string;
  	unownedRowIds: string[];
  	wishlistRowIds: string[];
  };

  // copies: the deck-card copies of this card in the relevant zone.
  // Each has shape { entry: { rowId: string; ownerId?: string | null } }.
  // oracleScryfallIds: every scryfallId for this oracle across all prints.
  // wishlistEntries: { scryfallId: string; entry: { rowId: string } }[].
  export function buildCollectionAddRequest(
  	cardName: string,
  	copies: ReadonlyArray<{ entry: { rowId: string; ownerId?: string | null } }>,
  	oracleScryfallIds: ReadonlyArray<string>,
  	wishlistEntries: ReadonlyArray<{ scryfallId: string; entry: { rowId: string } }>
  ): CollectionAddRequest;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/app/decks/[id]/collectionAddRequest.test.ts`:

```ts
import { buildCollectionAddRequest } from './collectionAddRequest';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
	if (cond) {
		console.log(`PASS: ${name}`);
		passed++;
	} else {
		console.error(`FAIL: ${name} ${detail}`);
		failed++;
	}
}

const copies = [
	{ entry: { rowId: 'r1', ownerId: null } },
	{ entry: { rowId: 'r2', ownerId: 'u1' } }, // owned -> excluded
	{ entry: { rowId: 'r3', ownerId: null } },
];
const oracleScryfallIds = ['s1', 's2'];
const wishlist = [
	{ scryfallId: 's1', entry: { rowId: 'w1' } }, // matches
	{ scryfallId: 's2', entry: { rowId: 'w2' } }, // matches
	{ scryfallId: 'sX', entry: { rowId: 'w3' } }, // no match -> excluded
];

const req = buildCollectionAddRequest('Lightning Bolt', copies, oracleScryfallIds, wishlist);

check('cardName passthrough', req.cardName === 'Lightning Bolt');
check(
	'unownedRowIds excludes owned',
	JSON.stringify(req.unownedRowIds) === JSON.stringify(['r1', 'r3']),
	`got ${JSON.stringify(req.unownedRowIds)}`
);
check(
	'wishlistRowIds filtered by oracle scryfallIds',
	JSON.stringify(req.wishlistRowIds) === JSON.stringify(['w1', 'w2']),
	`got ${JSON.stringify(req.wishlistRowIds)}`
);

const empty = buildCollectionAddRequest('X', [], [], []);
check(
	'empty inputs -> empty arrays',
	empty.unownedRowIds.length === 0 && empty.wishlistRowIds.length === 0
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx "src/app/decks/[id]/collectionAddRequest.test.ts"`
Expected: FAIL — module `./collectionAddRequest` not found (cannot import `buildCollectionAddRequest`).

- [ ] **Step 3: Write minimal implementation**

Create `src/app/decks/[id]/collectionAddRequest.ts`:

```ts
export type CollectionAddRequest = {
	cardName: string;
	unownedRowIds: string[];
	wishlistRowIds: string[];
};

/**
 * Build the request for AddCardToCollectionModal from a card's deck copies,
 * its full set of print scryfallIds, and the user's wishlist entries.
 */
export function buildCollectionAddRequest(
	cardName: string,
	copies: ReadonlyArray<{ entry: { rowId: string; ownerId?: string | null } }>,
	oracleScryfallIds: ReadonlyArray<string>,
	wishlistEntries: ReadonlyArray<{ scryfallId: string; entry: { rowId: string } }>
): CollectionAddRequest {
	const scryfallIdSet = new Set(oracleScryfallIds);
	const unownedRowIds = copies.filter((c) => !c.entry.ownerId).map((c) => c.entry.rowId);
	const wishlistRowIds = wishlistEntries
		.filter((e) => scryfallIdSet.has(e.scryfallId))
		.map((e) => e.entry.rowId);
	return { cardName, unownedRowIds, wishlistRowIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx "src/app/decks/[id]/collectionAddRequest.test.ts"`
Expected: PASS — `4 passed, 0 failed`.

- [ ] **Step 5: Run repo check**

Run: `npm run check`
Expected: passes (no type/lint/format errors).

- [ ] **Step 6: Commit**

```bash
git add "src/app/decks/[id]/collectionAddRequest.ts" "src/app/decks/[id]/collectionAddRequest.test.ts"
git commit -m "feat(deck): add buildCollectionAddRequest helper for collection-add modal"
```

---

## Task 2: `DeckCardOverlay` emits the request (badge + context menu)

**Files:**

- Modify: `src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx`

**Interfaces:**

- Consumes: `buildCollectionAddRequest`, `CollectionAddRequest` from Task 1; existing `group`, `currentZone`, `oracleScryfallIds`, `wishlistEntries` props already on the component.
- Produces: the prop contract for Task 5 —
  ```ts
  onAddToCollectionClick?: (req: CollectionAddRequest) => void;
  ```
  Used by BOTH the grey badge and the context-menu "Add to Collection" item.

**Context (current code):**

- Line 121: `onAddToCollectionClick?: () => void;`
- Lines 169-182: `buildContextMenuItems(...)` is called with `onAddToCollectionClick` (passed as the `onAddToCollection` param at line 179).
- Lines 71-83 inside `buildContextMenuItems`: the "Add to Collection" item calls `onAddToCollection()`.
- Lines 186-187: `handleBadgeClick` uses `onAddToCollectionClick` directly for `badgeState === 'none'`.

- [ ] **Step 1: Add the import**

At the top of `DeckCardOverlay.tsx`, after the existing `useCollectionBadge` import (line 6), add:

```ts
import { buildCollectionAddRequest } from '../../collectionAddRequest';
import type { CollectionAddRequest } from '../../collectionAddRequest';
```

(Path note: `DeckCardOverlay.tsx` is at `src/app/decks/[id]/components/DeckCardOverlay/`, so `../../collectionAddRequest` resolves to `src/app/decks/[id]/collectionAddRequest`.)

- [ ] **Step 2: Change the prop type**

In the `Props` type, replace line 121:

```ts
	onAddToCollectionClick?: () => void;
```

with:

```ts
	onAddToCollectionClick?: (req: CollectionAddRequest) => void;
```

- [ ] **Step 3: Change `buildContextMenuItems`' param type and call**

In `buildContextMenuItems`, change the `onAddToCollection` parameter (line 42) from:

```ts
	onAddToCollection: (() => void) | undefined,
```

to:

```ts
	onAddToCollection: ((req: CollectionAddRequest) => void) | undefined,
```

And change the item's onClick (line 78) from `onAddToCollection();` to:

```ts
onAddToCollection(buildRequest());
```

where `buildRequest` is a closure passed in. To avoid recomputing in two places, add a `buildRequest: () => CollectionAddRequest` parameter to `buildContextMenuItems` (insert it right after the existing `onAddToCollection` parameter at line 42):

```ts
	buildRequest: () => CollectionAddRequest,
```

Update the item body to use it (replace the whole onClick at lines 76-81):

```ts
							onClick: () => {
								onAddToCollection(buildRequest());
								closeMenu();
							},
```

- [ ] **Step 4: Compute the request once in the component and pass it through**

In the `DeckCardOverlay` function body, after `hasUnowned` is computed (line 167), add a memoized request builder. The card name comes from `group.representative.name`:

```ts
const buildAddRequest = useCallback(
	(): CollectionAddRequest =>
		buildCollectionAddRequest(
			group.representative.name,
			zoneCopies,
			oracleScryfallIds,
			wishlistEntries ?? []
		),
	[group.representative.name, zoneCopies, oracleScryfallIds, wishlistEntries]
);
```

Then update the `buildContextMenuItems(...)` call (lines 169-182) to pass `buildAddRequest` immediately after `onAddToCollectionClick`:

```ts
const items = buildContextMenuItems(
	zoneCopies,
	otherZones,
	lastCopy,
	representativeScryfallId,
	group,
	onDuplicate,
	onRemove,
	onChangeZone,
	onAddToWishlist,
	onAddToCollectionClick,
	buildAddRequest,
	hasUnowned,
	closeMenu
);
```

- [ ] **Step 5: Update the badge click**

Replace the `handleBadgeClick` definition (lines 184-187) with a handler that builds the request for the grey badge:

```ts
// The grey badge ("none") opens the add-to-collection confirmation modal via
// the parent; other badge states keep their existing behaviour (print picker).
const handleBadgeClick =
	badgeState === 'none' && onAddToCollectionClick
		? () => onAddToCollectionClick(buildAddRequest())
		: onBadgeClick;
```

(`handleBadgeClick` is already invoked as `handleBadgeClick?.()` at line 195 — no change needed there.)

- [ ] **Step 6: Run repo check**

Run: `npm run check`
Expected: passes. (tsc confirms the new signature is consistent across the call site and the param list.)

- [ ] **Step 7: Commit**

```bash
git add "src/app/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx"
git commit -m "feat(deck): emit collection-add request from badge and context menu"
```

---

## Task 3: `CardModal` splits add vs remove for the per-copy toggle

**Files:**

- Modify: `src/lib/card/components/CardModal/CardModal.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: a new optional prop, threaded through all three interfaces and the pass-down:
  ```ts
  onRemoveFromCollectionEntry?: (rowId: string) => void;
  ```
  Task 5 supplies it (`(rowId) => toggleOwned(rowId)`), and supplies `onAddToCollectionFromEntry` to open the modal instead of toggling.

**Context (current code):**

- `Props` interface: `onAddToCollectionFromEntry` at line 72.
- `InnerProps` interface: `onAddToCollectionFromEntry` at line 96.
- Inner destructure: line 313.
- Per-copy toggle button: lines 550-560 — calls `onAddToCollectionFromEntry([selectedCard.entry.rowId])` for both add and remove.
- Bulk add button: lines 636-642 — calls `onAddToCollectionFromEntry(unownedRowIds)` (add-only; unchanged).
- Outer destructure: line 886. Pass-down to `CardModalInner`: line 937.

- [ ] **Step 1: Add prop to `Props` interface**

After line 72 (`onAddToCollectionFromEntry?: (rowIds: string[]) => void;`) add:

```ts
	onRemoveFromCollectionEntry?: (rowId: string) => void;
```

- [ ] **Step 2: Add prop to `InnerProps` interface**

After line 96 (the `InnerProps` copy of `onAddToCollectionFromEntry?: (rowIds: string[]) => void;`) add:

```ts
	onRemoveFromCollectionEntry?: (rowId: string) => void;
```

- [ ] **Step 3: Destructure in `CardModalInner`**

In the inner-component destructure, after `onAddToCollectionFromEntry,` (line 313) add:

```ts
	onRemoveFromCollectionEntry,
```

- [ ] **Step 4: Split the per-copy toggle button**

Replace the toggle button's onClick (line 554) so that an owned copy removes and an unowned copy adds. The whole button block (lines 550-560) becomes:

```tsx
{
	(onAddToCollectionFromEntry || onRemoveFromCollectionEntry) && (
		<button
			type="button"
			className={styles.changePrintBtn}
			onClick={() =>
				selectedCard.entry.ownerId
					? onRemoveFromCollectionEntry?.(selectedCard.entry.rowId)
					: onAddToCollectionFromEntry?.([selectedCard.entry.rowId])
			}
		>
			{selectedCard.entry.ownerId ? 'Retirer de la collection' : 'Ajouter à la collection'}
		</button>
	);
}
```

(The bulk "Ajouter à la collection" button at lines 636-642 is add-only and stays on `onAddToCollectionFromEntry` — do not touch it.)

- [ ] **Step 5: Destructure in outer `CardModal`**

In the outer `CardModal` destructure, after `onAddToCollectionFromEntry,` (line 886) add:

```ts
	onRemoveFromCollectionEntry,
```

- [ ] **Step 6: Pass down to `CardModalInner`**

In the `<CardModalInner ... />` JSX, after `onAddToCollectionFromEntry={onAddToCollectionFromEntry}` (line 937) add:

```tsx
onRemoveFromCollectionEntry = { onRemoveFromCollectionEntry };
```

- [ ] **Step 7: Run repo check**

Run: `npm run check`
Expected: passes. (No consumer passes the new prop yet — optional, so existing call sites still type-check.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/card/components/CardModal/CardModal.tsx
git commit -m "feat(card-modal): separate remove-from-collection from add for per-copy toggle"
```

---

## Task 4: Wire `DeckDetailOwnerView` — state, modal, and all three entry points

**Files:**

- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx`

**Interfaces:**

- Consumes: `CollectionAddRequest` + `buildCollectionAddRequest` (Task 1); the new `onAddToCollectionClick(req)` contract (Task 2); the new `onRemoveFromCollectionEntry` prop and the modal-routed `onAddToCollectionFromEntry` (Task 3); `AddCardToCollectionModal` (existing).
- Produces: end-user behaviour. Terminal task.

**Context (current code):**

- Imports block ends ~line 47.
- `toggleOwned` from `useDeckContext()` (line 67).
- `useWishlistContext()` destructure (line 140): `const { addToWishlist, entries: wishlistEntries } = useWishlistContext();`
- `oracleIdToAllScryfallIds` map (lines 227-245) — `Map<oracleId, Set<scryfallId>>`.
- Badge/context-menu wiring: `onAddToCollectionClick` at lines 429-433 (currently loops `toggleOwned`).
- Detail-modal wiring: `onAddToCollectionFromEntry` at lines 680-682 (currently loops `toggleOwned`).
- `selectedCards` from `useDeckCardModal` (line 126) — the cards open in the detail `CardModal`.

- [ ] **Step 1: Add imports**

After the `AddDeckToCollectionModal` import (line 32) add:

```ts
import { AddCardToCollectionModal } from './components/AddCardToCollectionModal/AddCardToCollectionModal';
import { buildCollectionAddRequest, type CollectionAddRequest } from './collectionAddRequest';
```

- [ ] **Step 2: Pull `removeFromWishlist` from the wishlist context**

Change line 140 from:

```ts
const { addToWishlist, entries: wishlistEntries } = useWishlistContext();
```

to:

```ts
const { addToWishlist, removeFromWishlist, entries: wishlistEntries } = useWishlistContext();
```

- [ ] **Step 3: Add modal state**

Near the other `useState` declarations (e.g. just after line 75's `panelSelectedCard` state), add:

```ts
const [pendingCollectionAdd, setPendingCollectionAdd] = useState<CollectionAddRequest | null>(null);
```

- [ ] **Step 4: Replace the badge/context-menu handler to open the modal**

Replace the `onAddToCollectionClick` prop on `<DeckCardOverlay>` (lines 429-433) from:

```ts
					onAddToCollectionClick={() => {
						for (const copy of group.byZone.get(currentZone) ?? []) {
							if (!copy.entry.ownerId) toggleOwned(copy.entry.rowId);
						}
					}}
```

to:

```ts
					onAddToCollectionClick={(req) => {
						if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
					}}
```

(The request is already built inside `DeckCardOverlay` via `buildCollectionAddRequest`; the view just stores it. The `unownedRowIds.length > 0` guard implements the spec's "ne pas ouvrir la modale si vide".)

Because `toggleOwned` may no longer be referenced by this callback, leave it in the `renderOverlay` `useCallback` dependency array only if still used elsewhere in that callback; otherwise remove `toggleOwned` from the dep array (lines ~443-460) to satisfy lint. Run `npm run check` in Step 8 to confirm.

- [ ] **Step 5: Route the detail-modal add through the modal, add the remove callback**

Replace the `onAddToCollectionFromEntry` prop on the first `<CardModal>` (lines 680-682) from:

```ts
				onAddToCollectionFromEntry={(rowIds) => {
					for (const rowId of rowIds) toggleOwned(rowId);
				}}
```

with both an add (modal) and a remove (direct) handler:

```tsx
				onAddToCollectionFromEntry={(rowIds) => {
					const card = selectedCards?.[0];
					if (!card || rowIds.length === 0) return;
					const oracleScryfallIds = Array.from(
						oracleIdToAllScryfallIds.get(card.oracle_id ?? card.id) ?? new Set<string>([card.id])
					);
					const copies = rowIds
						.map((id) => selectedCards?.find((c) => c.entry.rowId === id))
						.filter((c): c is NonNullable<typeof c> => c != null);
					const req = buildCollectionAddRequest(
						card.name,
						copies,
						oracleScryfallIds,
						wishlistEntries
					);
					if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
				}}
				onRemoveFromCollectionEntry={(rowId) => toggleOwned(rowId)}
```

(Note: `rowIds` passed here are already the unowned copies — for the bulk button it's `unownedRowIds`; for the per-copy add button it's a single unowned rowId. `buildCollectionAddRequest` re-filters by `ownerId` defensively, so passing the matching `copies` is correct.)

- [ ] **Step 6: Render the modal**

Right after the first `<CardModal ... />` block closes (after line 688), add:

```tsx
{
	pendingCollectionAdd && (
		<AddCardToCollectionModal
			cardName={pendingCollectionAdd.cardName}
			unownedRowIds={pendingCollectionAdd.unownedRowIds}
			wishlistMatchCount={pendingCollectionAdd.wishlistRowIds.length}
			onConfirm={({ rowIds, asProxy, removeWishlist }) => {
				for (const rowId of rowIds) toggleOwned(rowId, asProxy);
				if (removeWishlist) {
					for (const rowId of pendingCollectionAdd.wishlistRowIds) {
						removeFromWishlist(rowId);
					}
				}
				setPendingCollectionAdd(null);
			}}
			onClose={() => setPendingCollectionAdd(null)}
		/>
	);
}
```

- [ ] **Step 7: Confirm `toggleOwned` accepts the proxy flag**

Verify (read-only) that `DeckContext`'s `toggleOwned` signature is `(rowId: string, proxy?: boolean) => void` (it is, per `src/lib/deck/context/DeckContext.tsx:51`). No code change — this step is a guard against a signature mismatch.

- [ ] **Step 8: Run repo check**

Run: `npm run check`
Expected: passes (tsc verifies the new prop wiring on both `DeckCardOverlay` and `CardModal`; eslint verifies hook deps).

- [ ] **Step 9: Manual smoke (report results)**

Run the app (`npm run dev`), open a deck you own, and verify:

1. Click a **grey badge** on a card not in the collection → the confirmation modal opens; nothing is added until you click "Ajouter".
2. **Right-click** a card → "Add to Collection" → same modal opens.
3. Open a card's **detail modal** → "Ajouter à la collection" (bulk and per-copy) → modal opens.
4. In the detail modal, on an **already-owned** copy, the button reads "Retirer de la collection" and removing it happens **directly** (no modal).
5. Confirm the modal's "marquer comme proxy" and "retirer de la wishlist" options take effect after "Ajouter".

State the observed result for each.

- [ ] **Step 10: Commit**

```bash
git add "src/app/decks/[id]/DeckDetailOwnerView.tsx"
git commit -m "feat(deck): open confirmation modal for all collection-add entry points"
```

---

## Self-Review Notes

- **Spec coverage:** badge (Task 2/4), right-click menu (Task 2/4, same prop), CardModal add bulk + per-copy (Task 3/4), CardModal remove stays direct (Task 3/4 `onRemoveFromCollectionEntry`), proxy + remove-wishlist options applied on confirm (Task 4 Step 6), empty-`unownedRowIds` guard (Task 4 Steps 4-5), single shared modal instance (Task 4 Step 6), `CardModal` stays decoupled (Task 3 adds only callbacks).
- **Type consistency:** `CollectionAddRequest` defined once (Task 1) and imported by Tasks 2 and 4; `onAddToCollectionClick: (req: CollectionAddRequest) => void` matches between Task 2 (producer) and Task 4 (consumer); `onRemoveFromCollectionEntry: (rowId: string) => void` matches between Task 3 (declaration) and Task 4 (supply).
- **No React component-test infra exists**; pure logic is covered by the Task 1 tsx-script test, the rest by `npm run check` + the Task 4 manual smoke — consistent with the repo's existing testing pattern.
