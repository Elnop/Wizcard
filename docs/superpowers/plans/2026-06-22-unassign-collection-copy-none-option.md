# Option « Aucune » : désassigner une copie de collection d'un deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une option « Aucune » dans `UseCollectionCopyModal` qui désassigne la copie owned liée au deck-card courant (la copie redevient une carte de collection libre, owned, `deckId` null) et remplace le deck-card par un placeholder non-owned.

**Architecture:** Une nouvelle action store `unassignCollectionCopyFromDeckCard` (symétrique de `replaceDeckCardWithCollectionCopy`) fait le travail : elle libère la copie de collection (logique `detach`) et crée un placeholder non-owned (logique `addCardToDeck`). Elle est exposée via `DeckContext`, déclenchée par un nouveau handler dans `useDeckCardModal`, câblée dans `CardModal` via une nouvelle prop `onUnassignCollectionCopy`, et déclenchée par un bouton « Aucune » dans `UseCollectionCopyModal`.

**Tech Stack:** TypeScript, React, Zustand (`deck-store`, `collection-store`), Next.js. Tests : scripts standalone `*.test.ts` exécutés via `npx tsx`.

## Global Constraints

- Les actions store reçoivent `userId: string` et `triggerSync: () => void` en derniers paramètres ; les wrappers `DeckContext` les injectent depuis `userId`/`triggerSync` et `return` tôt si `!userId`.
- Le `rowId` d'une copie de collection sert aussi de `rowId` du deck-card (pas de nouvelle UUID lors de l'assignation). Le placeholder non-owned, lui, prend une **nouvelle** `crypto.randomUUID()`.
- Une copie « owned » a `entry.ownerId` défini ; une copie non-owned a `entry.ownerId === undefined`.
- Les zones de deck sont encodées dans `entry.tags` via `setDeckZone(tags, zone)` / lues via `getDeckZone(tags)`.
- Tests : pas d'assertion sur la file de sync (`enqueue` écrit dans `localStorage`, indisponible sous `tsx`). On assert uniquement l'état des stores `deck-store` et `collection-store`, comme `toggle-owned-collection-sync.test.ts`.
- Langue de l'UI : français.

---

### Task 1: Action store `unassignCollectionCopyFromDeckCard`

**Files:**

- Modify: `src/lib/deck/store/deck-store.ts` (interface `DeckActions` après la déclaration `replaceDeckCardWithCollectionCopy` ~ligne 117-124 ; implémentation après le bloc `replaceDeckCardWithCollectionCopy` ~ligne 758)
- Test: `src/lib/deck/store/unassign-collection-copy.test.ts` (créer)

**Interfaces:**

- Consumes: `useDeckStore` (zustand), `useCollectionStore` from `@/lib/collection/store/collection-store`, helpers `setDeckZone` (déjà importé dans le fichier), `enqueue` (déjà importé), constante `SYNC_DECK_CARD_INSERT` (déjà définie ligne 14).
- Produces:

  ```ts
  unassignCollectionCopyFromDeckCard(
    deckCardRowId: string,
    deckId: string,
    zone: DeckZone,
    userId: string,
    triggerSync: () => void,
  ): void
  ```

  Effets observables : l'ancienne row owned quitte `activeDeckCards` mais reste dans `useCollectionStore.entries` avec `deckId === undefined` et `ownerId` conservé ; une nouvelle row non-owned (UUID) apparaît dans `activeDeckCards` avec le même `scryfallId`, `deckId` correct, tags de la zone, sans `ownerId`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/deck/store/unassign-collection-copy.test.ts`:

```ts
import { useDeckStore } from './deck-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import type { CardEntry } from '@/types/cards';

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

const noop = () => {};
const USER = 'user-1';
const ROW = 'owned-row-1';
const SCRYFALL = 'scry-1';
const DECK = 'deck-1';

function entry(overrides?: Partial<CardEntry>): CardEntry {
	return {
		rowId: ROW,
		dateAdded: '2026-01-01T00:00:00.000Z',
		tags: ['deck:mainboard'],
		deckId: DECK,
		ownerId: USER,
		...overrides,
	};
}

function reset() {
	// No `decks` entry needed: the action only reads decks[deckId] to bump
	// updatedAt, guarded by `if (deck)`, so its absence is a no-op here.
	useDeckStore.setState({
		activeDeckId: DECK,
		activeDeckCards: { [ROW]: { scryfallId: SCRYFALL, entry: entry() } },
		decks: {},
	});
	useCollectionStore.setState({
		entries: { [ROW]: { scryfallId: SCRYFALL, entry: entry() } },
	});
}

reset();
useDeckStore.getState().unassignCollectionCopyFromDeckCard(ROW, DECK, 'mainboard', USER, noop);

const deckCards = useDeckStore.getState().activeDeckCards;
const col = useCollectionStore.getState().entries;

// (a) freed copy stays owned, deckId cleared, still in collection
check('freed copy still in collection store', col[ROW] != null);
check(
	'freed copy keeps ownerId',
	col[ROW]?.entry.ownerId === USER,
	`got ${col[ROW]?.entry.ownerId}`
);
check(
	'freed copy deckId cleared',
	col[ROW]?.entry.deckId === undefined,
	`got ${col[ROW]?.entry.deckId}`
);

// (b) old owned row no longer in the deck
check('old owned row removed from deck', deckCards[ROW] == null);

// (c) a new non-owned placeholder exists in the deck
const placeholders = Object.entries(deckCards).filter(([id]) => id !== ROW);
check('exactly one new deck row exists', placeholders.length === 1, `got ${placeholders.length}`);
const ph = placeholders[0]?.[1];
check('placeholder keeps scryfallId', ph?.scryfallId === SCRYFALL, `got ${ph?.scryfallId}`);
check('placeholder has no ownerId', ph?.entry.ownerId === undefined, `got ${ph?.entry.ownerId}`);
check('placeholder has deckId set', ph?.entry.deckId === DECK, `got ${ph?.entry.deckId}`);
check(
	'placeholder is in mainboard zone',
	ph?.entry.tags?.includes('deck:mainboard') === true,
	`got ${JSON.stringify(ph?.entry.tags)}`
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/deck/store/unassign-collection-copy.test.ts`
Expected: FAIL — `unassignCollectionCopyFromDeckCard is not a function` (thrown TypeError).

- [ ] **Step 3: Add the action to the `DeckActions` interface**

In `src/lib/deck/store/deck-store.ts`, immediately after the `replaceDeckCardWithCollectionCopy` declaration (the block ending `) => void;` around line 124), add:

```ts
	unassignCollectionCopyFromDeckCard: (
		deckCardRowId: string,
		deckId: string,
		zone: DeckZone,
		userId: string,
		triggerSync: () => void
	) => void;
```

- [ ] **Step 4: Implement the action**

In `src/lib/deck/store/deck-store.ts`, immediately after the closing `},` of the `replaceDeckCardWithCollectionCopy` implementation (around line 758, before `getDeckCardCount:`), add:

```ts
	unassignCollectionCopyFromDeckCard: (deckCardRowId, deckId, zone, userId, triggerSync) => {
		const current = get().activeDeckCards;
		const deckCard = current[deckCardRowId];
		if (!deckCard) return;

		// Only owned copies can be unassigned.
		if (!deckCard.entry.ownerId) return;

		if (!userId) {
			console.error('[deck-store] unassignCollectionCopyFromDeckCard: userId absent, aborting');
			return;
		}

		// 1. Free the collection copy: remove from the deck, clear its deckId,
		//    keep it owned in the collection store.
		const freedEntry: CardEntry = { ...deckCard.entry, deckId: undefined };
		const next = { ...current };
		delete next[deckCardRowId];

		// 2. Create a fresh non-owned placeholder keeping the same scryfallId.
		const placeholderRowId = crypto.randomUUID();
		const placeholderEntry: CardEntry = {
			rowId: placeholderRowId,
			dateAdded: new Date().toISOString(),
			deckId,
			tags: setDeckZone(undefined, zone),
		};
		next[placeholderRowId] = { scryfallId: deckCard.scryfallId, entry: placeholderEntry };
		set({ activeDeckCards: next });

		// Bump deck updatedAt
		const deck = get().decks[deckId];
		if (deck) {
			set((state) => ({
				decks: {
					...state.decks,
					[deckId]: { ...deck, updatedAt: new Date().toISOString() },
				},
			}));
		}

		// Update collection store so the freed copy reappears as available.
		const colEntries = useCollectionStore.getState().entries;
		if (colEntries[deckCardRowId]) {
			useCollectionStore.setState({
				entries: {
					...colEntries,
					[deckCardRowId]: { scryfallId: deckCard.scryfallId, entry: freedEntry },
				},
			});
		}

		// Sync: free the owned copy (deck_id null) + insert the placeholder.
		enqueue({ type: 'update', payload: { userId, rowId: deckCardRowId, entry: freedEntry } });
		enqueue({
			type: SYNC_DECK_CARD_INSERT,
			payload: { deckId, scryfallId: deckCard.scryfallId, entry: placeholderEntry },
		});
		triggerSync();
	},
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx src/lib/deck/store/unassign-collection-copy.test.ts`
Expected: PASS — `11 passed, 0 failed`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/deck/store/deck-store.ts src/lib/deck/store/unassign-collection-copy.test.ts
git commit -m "feat(deck-store): unassignCollectionCopyFromDeckCard action"
```

---

### Task 2: Expose the action through `DeckContext`

**Files:**

- Modify: `src/lib/deck/context/DeckContext.tsx` (type `DeckContextValue` after `replaceDeckCardWithCollectionCopy` ~line 54-59 ; wrapper after the `replaceDeckCardWithCollectionCopy` useCallback ~line 242 ; `value` object ~line 271)

**Interfaces:**

- Consumes: `store.unassignCollectionCopyFromDeckCard` (Task 1), `userId`, `triggerSync` (already in scope in `DeckProvider`).
- Produces: context method

  ```ts
  unassignCollectionCopyFromDeckCard(
    deckCardRowId: string,
    deckId: string,
    zone: DeckZone,
  ): void
  ```

- [ ] **Step 1: Add to the `DeckContextValue` type**

In `src/lib/deck/context/DeckContext.tsx`, immediately after the `replaceDeckCardWithCollectionCopy` type member (the block ending `) => void;` around line 59), add:

```ts
	unassignCollectionCopyFromDeckCard: (
		deckCardRowId: string,
		deckId: string,
		zone: DeckZone
	) => void;
```

- [ ] **Step 2: Add the wrapper callback**

In `src/lib/deck/context/DeckContext.tsx`, immediately after the `replaceDeckCardWithCollectionCopy` useCallback (closing `);` around line 242), add:

```ts
const unassignCollectionCopyFromDeckCard = useCallback(
	(deckCardRowId: string, deckId: string, zone: DeckZone) => {
		if (!userId) return;
		store.unassignCollectionCopyFromDeckCard(deckCardRowId, deckId, zone, userId, triggerSync);
	},
	[store, userId, triggerSync]
);
```

- [ ] **Step 3: Add to the `value` object**

In `src/lib/deck/context/DeckContext.tsx`, in the `value: DeckContextValue = { ... }` object, after `replaceDeckCardWithCollectionCopy,` (~line 271), add:

```ts
		unassignCollectionCopyFromDeckCard,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck/context/DeckContext.tsx
git commit -m "feat(deck-context): expose unassignCollectionCopyFromDeckCard"
```

---

### Task 3: Handler in `useDeckCardModal`

**Files:**

- Modify: `src/lib/card/hooks/useDeckCardModal.ts` (destructure from context ~line 13-20 ; new handler after `handleAssignCollectionCopy` ~line 101 ; return object ~line 103-115)

**Interfaces:**

- Consumes: `useDeckContext().unassignCollectionCopyFromDeckCard` (Task 2), existing `selection`, `selectedCards`, `deckId`, `getDeckZone`.
- Produces: `handleUnassignCollectionCopy: () => void` in the hook's return value.

- [ ] **Step 1: Destructure the new action from the context**

In `src/lib/card/hooks/useDeckCardModal.ts`, add `unassignCollectionCopyFromDeckCard` to the destructuring of `useDeckContext()` (the block at lines 13-20), e.g. after `replaceDeckCardWithCollectionCopy,`:

```ts
		replaceDeckCardWithCollectionCopy,
		unassignCollectionCopyFromDeckCard,
	} = useDeckContext();
```

- [ ] **Step 2: Add the handler**

In `src/lib/card/hooks/useDeckCardModal.ts`, immediately after the `handleAssignCollectionCopy` useCallback (closing `);` around line 101), add:

```ts
// Called when the user selects "Aucune" to unassign the deck card from its
// collection copy. Replaces the owned copy with a non-owned placeholder.
const handleUnassignCollectionCopy = useCallback(() => {
	if (!selection || !selectedCards) return;
	const clickedCard = selectedCards.find((c) => c.entry.rowId === selection.clickedRowId);
	if (!clickedCard) return;
	const zone = getDeckZone(clickedCard.entry.tags);
	unassignCollectionCopyFromDeckCard(clickedCard.entry.rowId, deckId, zone);
}, [selection, selectedCards, deckId, unassignCollectionCopyFromDeckCard]);
```

- [ ] **Step 3: Add to the return object**

In `src/lib/card/hooks/useDeckCardModal.ts`, in the returned object (lines 103-115), after `handleAssignCollectionCopy,`, add:

```ts
		handleUnassignCollectionCopy,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/hooks/useDeckCardModal.ts
git commit -m "feat(deck-card-modal): handleUnassignCollectionCopy"
```

---

### Task 4: Thread `onUnassignCollectionCopy` through `CardModal`

**Files:**

- Modify: `src/lib/card/components/CardModal/CardModal.tsx` (public `Props` ~line 69 ; `InnerProps` ~line 95 ; inner destructure ~line 314 ; outer destructure ~line 895 ; pass to inner ~line 948 ; pass to `UseCollectionCopyModal` ~line 717-726)

**Interfaces:**

- Consumes: `UseCollectionCopyModal` prop `onSelectNone` (Task 5).
- Produces: `CardModal` prop `onUnassignCollectionCopy?: () => void`.

- [ ] **Step 1: Add the prop to the public `Props` interface**

In `src/lib/card/components/CardModal/CardModal.tsx`, after `onAssignCollectionCopy?: (rowId: string) => void;` (line 69), add:

```ts
	onUnassignCollectionCopy?: () => void;
```

- [ ] **Step 2: Add the prop to `InnerProps`**

After `onAssignCollectionCopy?: (rowId: string) => void;` (line 95), add:

```ts
	onUnassignCollectionCopy?: () => void;
```

- [ ] **Step 3: Destructure in the inner component**

In the inner component's props destructuring (around line 314, where `onAssignCollectionCopy,` appears), add on the next line:

```ts
	onUnassignCollectionCopy,
```

- [ ] **Step 4: Destructure in the outer component**

In the outer component's props destructuring (around line 895, where the second `onAssignCollectionCopy,` appears), add on the next line:

```ts
	onUnassignCollectionCopy,
```

- [ ] **Step 5: Forward from outer to inner**

Where the outer component renders the inner one and passes `onAssignCollectionCopy={onAssignCollectionCopy}` (around line 948), add on the next line:

```tsx
onUnassignCollectionCopy = { onUnassignCollectionCopy };
```

- [ ] **Step 6: Pass to `UseCollectionCopyModal`**

In the `<UseCollectionCopyModal ... />` block (lines 717-726), after the `onSelectCollectionCopy={...}` prop, add:

```tsx
					onSelectNone={
						onUnassignCollectionCopy
							? () => {
									onUnassignCollectionCopy();
									setUsingCollectionCopy(false);
								}
							: undefined
					}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only about `onSelectNone` not existing on `UseCollectionCopyModal` props (resolved in Task 5). If other errors appear, fix them.

- [ ] **Step 8: Commit**

```bash
git add src/lib/card/components/CardModal/CardModal.tsx
git commit -m "feat(card-modal): thread onUnassignCollectionCopy to UseCollectionCopyModal"
```

---

### Task 5: « Aucune » button in `UseCollectionCopyModal`

**Files:**

- Modify: `src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.tsx` (`Props` ~line 22-29 ; component params ~line 31-37 ; render the banner inside `.body` before `{content}` ~line 169)
- Modify: `src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.module.css` (new `.noneRow` / `.noneBtn` classes)

**Interfaces:**

- Consumes: `onSelectNone?: () => void`, existing `currentCollectionRowId`, `onClose`.
- Produces: `UseCollectionCopyModal` prop `onSelectNone?: () => void`. Renders a « Aucune » button only when `onSelectNone` is provided and `currentCollectionRowId !== undefined`.

- [ ] **Step 1: Add the prop to `Props`**

In `src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.tsx`, in the `Props` interface (lines 22-29), after `onSelectCollectionCopy: (rowId: string) => void;`, add:

```ts
	/** When provided and a copy is currently linked, shows an "Aucune" option to unassign. */
	onSelectNone?: () => void;
```

- [ ] **Step 2: Destructure the prop**

In the component parameter list (lines 31-37), after `onSelectCollectionCopy,`, add:

```ts
	onSelectNone,
```

- [ ] **Step 3: Render the « Aucune » banner**

In the `return (...)`, inside `<div className={styles.body}>` (line 169), replace:

```tsx
<div className={styles.body}>{content}</div>
```

with:

```tsx
<div className={styles.body}>
	{onSelectNone && currentCollectionRowId !== undefined && (
		<div className={styles.noneRow}>
			<button
				type="button"
				className={styles.noneBtn}
				onClick={() => {
					onSelectNone();
					onClose();
				}}
			>
				Aucune — désassigner cette carte du deck (redevient non possédée)
			</button>
		</div>
	)}
	{content}
</div>
```

- [ ] **Step 4: Add the CSS classes**

In `src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.module.css`, append at the end of the file:

```css
.noneRow {
	margin-bottom: 16px;
}

.noneBtn {
	width: 100%;
	padding: 10px 12px;
	font-size: var(--text-sm);
	font-weight: 600;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--surface, rgba(255, 255, 255, 0.04));
	color: var(--text-muted);
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}

.noneBtn:hover {
	border-color: #ef4444;
	color: #ef4444;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (including the Task 4 `onSelectNone` error now resolved).

- [ ] **Step 6: Lint + format**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.tsx src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.module.css
git commit -m "feat(use-collection-copy-modal): add 'Aucune' unassign option"
```

---

### Task 6: Wire `onUnassignCollectionCopy` in `DeckDetailOwnerView`

**Files:**

- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx` (`handleUnassignCollectionCopy` from `useDeckCardModal` ~line 152 ; pass to `<CardModal>` ~line 729)

**Interfaces:**

- Consumes: `useDeckCardModal(...).handleUnassignCollectionCopy` (Task 3), `CardModal` prop `onUnassignCollectionCopy` (Task 4).
- Produces: end-to-end wiring; no new exports.

- [ ] **Step 1: Pull the handler from the hook**

In `src/app/decks/[id]/DeckDetailOwnerView.tsx`, in the destructuring of `useDeckCardModal(deckId, groupByCardId)` (the block that includes `handleAssignCollectionCopy,` around line 152), add:

```ts
		handleAssignCollectionCopy,
		handleUnassignCollectionCopy,
	} = useDeckCardModal(deckId, groupByCardId);
```

- [ ] **Step 2: Pass it to `<CardModal>`**

In the `<CardModal ... />` usage, immediately after `onAssignCollectionCopy={handleAssignCollectionCopy}` (line 729), add:

```tsx
onUnassignCollectionCopy = { handleUnassignCollectionCopy };
```

- [ ] **Step 3: Typecheck + full check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Re-run the store test**

Run: `npx tsx src/lib/deck/store/unassign-collection-copy.test.ts`
Expected: PASS — `11 passed, 0 failed`.

- [ ] **Step 5: Manual smoke test (note for executor)**

Run `npm run dev`, open a deck (owner view), open a card that is currently using an owned collection copy, click « Utiliser une carte de la collection », confirm the « Aucune » banner appears at the top, click it, and verify: (a) the deck card becomes non-owned, (b) the freed copy reappears as available in the collection list. (No automated browser test in this plan.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/decks/[id]/DeckDetailOwnerView.tsx"
git commit -m "feat(deck-detail): wire onUnassignCollectionCopy"
```

---

## Self-Review

**Spec coverage:**

- Action store `unassignCollectionCopyFromDeckCard` (libère la copie owned + crée placeholder non-owned) → Task 1. ✓
- Copie libérée reste owned, `deckId` undefined → Task 1, asserts (a). ✓
- Placeholder non-owned, même `scryfallId`, bonne zone → Task 1, asserts (c). ✓
- Hook `handleUnassignCollectionCopy` → Task 3. ✓
- Prop `CardModal.onUnassignCollectionCopy` + fermeture modale → Task 4. ✓
- UI « Aucune » au-dessus du `CardList`, conditionnée à `currentCollectionRowId` défini → Task 5. ✓
- Câblage `DeckDetailOwnerView` → Task 6. ✓
- Tests store façon `toggle-owned-collection-sync.test.ts` (asserts a/b/c) → Task 1. ✓ (Les asserts d'événements (d) du spec sont volontairement omis : `enqueue` n'est pas observable sous `tsx` ; documenté dans Global Constraints.)

**Placeholder scan:** Aucun TBD/TODO ; tout le code est fourni inline.

**Type consistency:** `unassignCollectionCopyFromDeckCard` a la même signature dans l'interface store (Task 1), le contexte expose une version sans `userId`/`triggerSync` (Task 2), le hook l'appelle avec `(rowId, deckId, zone)` (Task 3). Prop `onUnassignCollectionCopy: () => void` cohérente entre `CardModal` (Task 4) et son usage (Task 6). Prop `onSelectNone: () => void` cohérente entre `UseCollectionCopyModal` (Task 5) et `CardModal` (Task 4).
