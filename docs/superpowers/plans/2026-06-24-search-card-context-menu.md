# Search Card Context Menu + Quantity in Add Flows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click context menu to search-result cards (view details, open card page, add to collection, add to wishlist) and add a Quantity field to every `EditCardModal` add flow.

**Architecture:** Reuse existing infrastructure — `ContextMenu`/`useContextMenu`, the `onCardContextMenu` prop already threaded through `CardList`/`CardListGrid`, and the menu-builder pattern from `wishlistCardMenu.ts`. The add-quantity feature extends `EditCardModal`'s existing `mode="add"` by looping its `onAdd` callback N times. No new dependencies.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, CSS modules. Unit tests are plain `tsx` scripts using a hand-rolled `check()` helper (see `src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts`), run with `npx tsx <file>`.

## Global Constraints

- Run `npm run check` (tsc + ESLint + Prettier) before every commit; it must pass.
- UI copy is in French, matching existing menus (e.g. `wishlistCardMenu.ts`).
- Custom cards / cardbacks: only "Voir les détails" applies. Distinguish with `isCustomCard(card)` from `@/lib/mpc/types` (signature: `isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard`).
- Each added copy is a separate entry (its own `rowId`); quantity = N means call `onAdd` N times. Do NOT introduce a single-entry counter.
- `ContextMenuAction` type: `{ type: 'action'; label: string; icon?: string; danger?: boolean; onClick: () => void } | { type: 'divider' }` from `@/components/ContextMenu/ContextMenu`.

---

### Task 1: Quantity field in `EditCardModal` add mode

**Files:**

- Modify: `src/lib/card/components/EditCardModal/EditCardModal.tsx`

**Interfaces:**

- Consumes: existing `AddProps.onAdd: (card: ScryfallCard, entry: Partial<CardEntry>) => void`, existing `handleConfirmAdd`, existing CSS classes `styles.field`, `styles.label`, `styles.select`.
- Produces: no signature changes. All `mode="add"` callers automatically render the Quantity field; `onAdd` is invoked N times on confirm.

- [ ] **Step 1: Add quantity state**

In `EditCardModal.tsx`, just after the existing `const [tagInput, setTagInput] = useState('');` line (~line 61), add:

```tsx
const [quantity, setQuantity] = useState(1);
```

- [ ] **Step 2: Loop `onAdd` in `handleConfirmAdd`**

Replace the existing `handleConfirmAdd` function (currently):

```tsx
function handleConfirmAdd() {
	if (addMode) {
		props.onAdd(selectedPrint, draftEntry);
		props.onClose();
	}
}
```

with:

```tsx
function handleConfirmAdd() {
	if (addMode) {
		const count = Math.max(1, Math.floor(quantity) || 1);
		for (let i = 0; i < count; i++) {
			props.onAdd(selectedPrint, draftEntry);
		}
		props.onClose();
	}
}
```

- [ ] **Step 3: Render the Quantity field (add mode only)**

In the `<div className={styles.form}>` block, immediately after the opening of that div and BEFORE the existing Zone field comment (`{/* Zone (add mode only, when multiple zones available) */}`, ~line 187), insert:

```tsx
{
	/* Quantité (add mode only) */
}
{
	addMode && (
		<div className={styles.field}>
			<label className={styles.label} htmlFor="copy-add-quantity">
				Quantité
			</label>
			<input
				id="copy-add-quantity"
				type="number"
				min={1}
				step={1}
				className={styles.select}
				value={quantity}
				onChange={(e) => {
					const n = parseInt(e.target.value, 10);
					setQuantity(Number.isNaN(n) ? 1 : Math.max(1, n));
				}}
			/>
		</div>
	);
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npm run check`
Expected: PASS (no TS/ESLint/Prettier errors). If Prettier reformats, accept it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/components/EditCardModal/EditCardModal.tsx
git commit -m "feat(edit-card-modal): add quantity field to add mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `buildSearchMenuItems` menu builder + test

**Files:**

- Create: `src/app/search/searchCardMenu.ts`
- Create: `src/app/search/searchCardMenu.test.ts`

**Interfaces:**

- Consumes: `ContextMenuAction` from `@/components/ContextMenu/ContextMenu`; `AnyCard` from `@/lib/card/components/CardList/CardList.types`; `isCustomCard` from `@/lib/mpc/types`.
- Produces:

  ```ts
  export type SearchCardMenuHandlers = {
  	onViewDetails: (card: AnyCard) => void;
  	onOpenCardPage: (card: AnyCard) => void;
  	onAddToCollection: (card: AnyCard) => void;
  	onAddToWishlist: (card: AnyCard) => void;
  };
  export function buildSearchMenuItems(
  	card: AnyCard,
  	handlers: SearchCardMenuHandlers,
  	close: () => void
  ): ContextMenuAction[];
  ```

  For an official (non-custom) card: 5 items — view details, open card page, divider, add to collection, add to wishlist. For a custom card: 1 item — view details only. Every `action` `onClick` calls its handler then `close()`.

- [ ] **Step 1: Write the failing test**

Create `src/app/search/searchCardMenu.test.ts`:

```ts
import { buildSearchMenuItems } from './searchCardMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

const noop = () => {};
const handlers = {
	onViewDetails: noop,
	onOpenCardPage: noop,
	onAddToCollection: noop,
	onAddToWishlist: noop,
};

// Official Scryfall card: no `source_type` / `card_type` discriminators.
const officialCard = { id: 'abc', name: 'Sol Ring' } as unknown as AnyCard;
const officialItems = buildSearchMenuItems(officialCard, handlers, noop);
const officialActions = officialItems.filter((i) => i.type === 'action');
check('official: 4 actions', officialActions.length === 4);
check('official: 1 divider', officialItems.filter((i) => i.type === 'divider').length === 1);
check(
	'official: first action is view details',
	officialItems[0].type === 'action' && officialItems[0].label === 'Voir les détails'
);

// Custom card: `source_type` + `card_type` make isCustomCard return true.
const customCard = {
	id: 'def',
	name: 'My Token',
	source_type: 'mpc',
	card_type: 'token',
} as unknown as AnyCard;
const customItems = buildSearchMenuItems(customCard, handlers, noop);
check('custom: only 1 item', customItems.length === 1);
check(
	'custom: that item is view details',
	customItems[0].type === 'action' && customItems[0].label === 'Voir les détails'
);

// close() is called after a handler runs.
let closed = false;
let viewed = false;
const items = buildSearchMenuItems(
	officialCard,
	{ ...handlers, onViewDetails: () => (viewed = true) },
	() => (closed = true)
);
const first = items[0];
if (first.type === 'action') first.onClick();
check('view details onClick calls handler', viewed);
check('view details onClick calls close', closed);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/app/search/searchCardMenu.test.ts`
Expected: FAIL — module `./searchCardMenu` not found (cannot resolve import).

- [ ] **Step 3: Write the menu builder**

Create `src/app/search/searchCardMenu.ts`:

```ts
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { isCustomCard } from '@/lib/mpc/types';

export type SearchCardMenuHandlers = {
	onViewDetails: (card: AnyCard) => void;
	onOpenCardPage: (card: AnyCard) => void;
	onAddToCollection: (card: AnyCard) => void;
	onAddToWishlist: (card: AnyCard) => void;
};

export function buildSearchMenuItems(
	card: AnyCard,
	handlers: SearchCardMenuHandlers,
	close: () => void
): ContextMenuAction[] {
	const items: ContextMenuAction[] = [
		{
			type: 'action',
			label: 'Voir les détails',
			icon: '👁',
			onClick: () => {
				handlers.onViewDetails(card);
				close();
			},
		},
	];

	// Custom cards / cardbacks have no Scryfall page and aren't tracked in
	// the collection or wishlist — only "view details" applies.
	if (isCustomCard(card)) {
		return items;
	}

	items.push(
		{
			type: 'action',
			label: 'Ouvrir la page de la carte',
			icon: '🔗',
			onClick: () => {
				handlers.onOpenCardPage(card);
				close();
			},
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: 'Ajouter à la collection…',
			icon: '▣',
			onClick: () => {
				handlers.onAddToCollection(card);
				close();
			},
		},
		{
			type: 'action',
			label: 'Ajouter à la wishlist…',
			icon: '♡',
			onClick: () => {
				handlers.onAddToWishlist(card);
				close();
			},
		}
	);

	return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/app/search/searchCardMenu.test.ts`
Expected: `7 passed, 0 failed`.

- [ ] **Step 5: Verify lint/types**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/search/searchCardMenu.ts src/app/search/searchCardMenu.test.ts
git commit -m "feat(search): add buildSearchMenuItems context-menu builder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the context menu into the search page

**Files:**

- Modify: `src/app/search/page.tsx`

**Interfaces:**

- Consumes: `buildSearchMenuItems` + `SearchCardMenuHandlers` (Task 2); `EditCardModal` add mode with quantity (Task 1); existing `addCard` / `addToWishlist` from contexts; `useContextMenu`, `ContextMenu`.
- Produces: end-user feature; nothing downstream depends on it.

- [ ] **Step 1: Add imports**

In `src/app/search/page.tsx`, add these imports near the existing imports (after line 21 / alongside the other `@/lib` and local imports):

```tsx
import { useRouter } from 'next/navigation';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { buildSearchMenuItems } from './searchCardMenu';
```

- [ ] **Step 2: Add hooks and state inside `SearchPageContent`**

Just after the existing `const [selectedCard, setSelectedCard] = useState<AnyCard | null>(null);` line (~line 55), add:

```tsx
const router = useRouter();
const cardMenu = useContextMenu<AnyCard>();
const [addModal, setAddModal] = useState<{
	card: ScryfallCard;
	target: 'collection' | 'wishlist';
} | null>(null);
```

- [ ] **Step 3: Pass `onCardContextMenu` to `CardList`**

In the `<CardList … />` JSX, add the prop right after the existing `onCardClick={handleCardClick}` line:

```tsx
onCardContextMenu={(card, e) => cardMenu.open(card, e)}
```

- [ ] **Step 4: Render the context menu and add modal**

Immediately after the existing `selectedCard && ( <CardModal … /> )` block and before the closing `</main>`, add:

```tsx
{
	cardMenu.menu && (
		<ContextMenu
			items={buildSearchMenuItems(
				cardMenu.menu.data,
				{
					onViewDetails: (card) => setSelectedCard(card),
					onOpenCardPage: (card) => router.push(`/card/${card.id}`),
					onAddToCollection: (card) =>
						setAddModal({ card: card as ScryfallCard, target: 'collection' }),
					onAddToWishlist: (card) =>
						setAddModal({ card: card as ScryfallCard, target: 'wishlist' }),
				},
				cardMenu.close
			)}
			position={cardMenu.menu.position}
			onClose={cardMenu.close}
		/>
	);
}

{
	addModal && (
		<EditCardModal
			mode="add"
			scryfallCard={addModal.card}
			onAdd={(card, entry) => {
				if (addModal.target === 'collection') {
					addCard(card, entry);
				} else {
					addToWishlist(card, entry);
				}
			}}
			onClose={() => setAddModal(null)}
		/>
	);
}
```

- [ ] **Step 5: Verify lint/types**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `/search`.

- Right-click an official card → menu shows 4 actions + divider: Voir les détails, Ouvrir la page de la carte, Ajouter à la collection…, Ajouter à la wishlist….
- "Ouvrir la page de la carte" navigates to `/card/<id>`.
- "Ajouter à la collection…" opens `EditCardModal` with a Quantité field; set 3, confirm → 3 copies appear in the collection.
- Switch search mode to "custom" / cardbacks → right-click shows only "Voir les détails".

- [ ] **Step 7: Commit**

```bash
git add src/app/search/page.tsx
git commit -m "feat(search): right-click context menu on search cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Menu items (view details / card page / collection / wishlist) → Task 2 (builder) + Task 3 (wiring). ✓
- Custom-card filtering via `isCustomCard` → Task 2. ✓
- Add via `EditCardModal mode="add"` with Quantity → Task 1 + Task 3. ✓
- Quantity in ALL add flows (not opt-in) → Task 1 modifies the shared component with no new prop, so AddToCollectionButton, PrintsTab, DeckDetailReadOnlyView inherit it. ✓
- N copies = N entries → Task 1 loop. ✓
- `npm run check` gate → every task. ✓

**Placeholder scan:** No TBD/TODO; all steps contain concrete code or exact commands. ✓

**Type consistency:** `buildSearchMenuItems(card, handlers, close)` and `SearchCardMenuHandlers` field names (`onViewDetails`, `onOpenCardPage`, `onAddToCollection`, `onAddToWishlist`) are identical across Task 2's definition, its test, and Task 3's call site. `EditCardModal` add-mode props (`mode`, `scryfallCard`, `onAdd`, `onClose`) match the existing `AddProps` interface. ✓
