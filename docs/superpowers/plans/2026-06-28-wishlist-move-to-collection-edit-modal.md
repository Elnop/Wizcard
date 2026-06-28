# Wishlist Move-to-Collection Flip + Unified `wishlist` Flag — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le déplacement wishlist → collection devient un _flip_ de la colonne `wishlist` (true→false) sur les rows existantes — aucun insert/delete — et le flag `wishlist` est unifié comme champ de `CardEntry` sérialisé partout.

**Architecture:** `wishlist` devient un champ de premier ordre de `CardEntry`, sérialisé par `cardEntryToRow` et désérialisé par `rowToCardEntry` (déjà le cas en lecture). On supprime les paramètres/payloads `wishlist` parallèles (`insertEntry`/`insertEntries`, ops `insert`/`bulk-insert`). `updateEntry` écrit désormais `wishlist`, ce qui permet à `moveToCollection(rowIds, scryfallId, entryPatch)` de flipper N rows via un `update` par row (quantité capée à la taille du stack, couplage deck conservé).

**Tech Stack:** Next.js 16 App Router, React, TypeScript strict, Zustand stores, Supabase sync-queue (localStorage-backed), CSS Modules.

**Contexte v1 (déjà sur `main`, commits `db9b00e..885dae1`) :** `EditCardModal` a déjà la prop `initialEntry` ; `src/app/wishlist/page.tsx` a déjà `movingCard`, `cardByRowId`, `buildInitialEntry`, `handleRequestMove`, et rend déjà `<EditCardModal>` ; `WishlistContext.moveToCollection` a la signature v1 `(rowId, scryfallId, entryPatch, count)` qui fait `addCards` + `removeFromWishlist` (delete+insert). Ce plan **transforme** cet existant vers le modèle flip.

## Global Constraints

- TypeScript strict ; path alias `@/*` → `./src/*`.
- React Compiler désactivé — deps de `useCallback`/`useMemo` correctes manuellement.
- Pas de barrel exports — importer les fichiers directement.
- Ne jamais appeler le client Supabase hors de `src/lib/supabase/`. Les modules `db/` mappent rows ↔ types domaine ; les queries `supabase/queries/*` acceptent/retournent des ROWS.
- Toujours `triggerSync()` après `enqueue()`.
- Écrire le format localStorage courant `{ scryfallId, entry }`.
- Vérification par tâche : `npm run check` (tsc + eslint + prettier). **Aucun framework de test unitaire** — validation statique + manuelle.
- Garde-fou unification : `wishlist` préservé via l'entry en mémoire (patchs `{ ...entry, ...patch }` sans écraser `wishlist`). Ne **jamais** écrire un `update` dont l'entry a perdu `wishlist` par omission.

---

### Task 1: `cardEntryToRow` sérialise `wishlist`

Rend `wishlist` un champ du payload row commun, au lieu d'être ajouté par chaque appelant.

**Files:**

- Modify: `src/lib/card/db/cardRow.ts:88-104` (`cardEntryToRow`) + commentaire `:83-87`

**Interfaces:**

- Consumes: `CardEntry.wishlist?: boolean` (existe déjà dans `src/types/cards.ts`).
- Produces: `cardEntryToRow(scryfallId, entry)` retourne désormais un objet incluant `wishlist: boolean`.

- [ ] **Step 1: Ajouter `wishlist` au retour de `cardEntryToRow`**

Dans `src/lib/card/db/cardRow.ts`, dans l'objet retourné par `cardEntryToRow` (après `deck_id: entry.deckId ?? null,`), ajouter :

```ts
		deck_id: entry.deckId ?? null,
		wishlist: entry.wishlist ?? false,
```

- [ ] **Step 2: Mettre à jour le commentaire d'en-tête**

Remplacer le commentaire au-dessus de `cardEntryToRow` (lignes ~83-87) :

```ts
/**
 * Common insert/update payload for a card. The table-specific column
 * `owner_id` is added by the caller; `deck_id` and `wishlist` are included
 * here (and `deck_id` may be overridden by the caller). Condition is normalized.
 */
```

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: PASS. (Les appelants `insertEntry`/`insertEntries` passent encore `wishlist` en plus via spread `{ ...cardEntryToRow(...), owner_id, wishlist }` — le spread du paramètre vient après et écrase la valeur de `cardEntryToRow`, donc comportement identique pour l'instant. C'est corrigé en Task 2.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/db/cardRow.ts
git commit -m "feat(card): serialize wishlist flag in cardEntryToRow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Retirer les paramètres `wishlist` parallèles (db + sync-queue + dispatch)

Supprime la double-source de vérité : `wishlist` ne voyage plus qu'à travers l'entry. `updateEntry` écrit désormais `wishlist`.

**Files:**

- Modify: `src/lib/collection/db/collection.ts` (`insertEntry`, `insertEntries`, `updateEntry`)
- Modify: `src/lib/supabase/sync-queue.ts` (payloads `insert`, `bulk-insert`)
- Modify: `src/lib/supabase/useSyncQueue.ts:39-50` (appels `insertEntry`/`insertEntries`)

**Interfaces:**

- Consumes: `cardEntryToRow` sérialise `wishlist` (Task 1).
- Produces:
  - `insertEntry(userId: string, scryfallId: string, entry: CardEntry): Promise<void>` (plus de param `wishlist`).
  - `insertEntries(userId: string, rows: Array<{ scryfallId: string; entry: CardEntry }>): Promise<void>` (plus de param `wishlist`).
  - `updateEntry` inchangé en signature ; pose `wishlist` dans le payload.
  - Ops sync `insert` et `bulk-insert` n'ont plus de champ `wishlist` dans leur payload.

- [ ] **Step 1: `insertEntry` — retirer le param `wishlist`**

Dans `src/lib/collection/db/collection.ts`, remplacer `insertEntry` (lignes ~50-57) :

```ts
export async function insertEntry(
	userId: string,
	scryfallId: string,
	entry: CardEntry
): Promise<void> {
	await insertCardRows([{ ...cardEntryToRow(scryfallId, entry), owner_id: userId }]);
}
```

- [ ] **Step 2: `insertEntries` — retirer le param `wishlist`**

Remplacer `insertEntries` (lignes ~61-73) :

```ts
export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (rows.length === 0) return;
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
		await insertCardRows(
			batch.map((r) => ({ ...cardEntryToRow(r.scryfallId, r.entry), owner_id: userId }))
		);
	}
}
```

- [ ] **Step 3: `updateEntry` — poser `wishlist` dans le payload**

Dans `updateEntry` (lignes ~88-110), ajouter `wishlist` au payload passé à `updateCardRow`, juste après `deck_id: entry.deckId ?? null,` :

```ts
		deck_id: entry.deckId ?? null,
		wishlist: entry.wishlist ?? false,
		// Changing the print (edition) must patch the existing row in place so the
		// card keeps its identity (rowId) across collection/deck/wishlist views.
		...(scryfallId !== undefined ? { scryfall_id: scryfallId } : {}),
```

- [ ] **Step 4: sync-queue — retirer `wishlist?` des payloads `insert` et `bulk-insert`**

Dans `src/lib/supabase/sync-queue.ts`, dans le type `SyncOp` :

- op `insert` (lignes ~7-19) : supprimer la ligne `wishlist?: boolean;` du `payload`.
- op `bulk-insert` (lignes ~34-44) : supprimer la ligne `wishlist?: boolean;` du `payload`.

- [ ] **Step 5: useSyncQueue — appels sans l'arg `wishlist`**

Dans `src/lib/supabase/useSyncQueue.ts`, remplacer les branches `insert` et `bulk-insert` (lignes ~39-50) :

```ts
	if (op.type === 'insert') {
		await insertEntry(op.payload.userId, op.payload.scryfallId, op.payload.entry);
	} else if (op.type === 'delete') {
		await deleteEntryById(op.payload.userId, op.payload.rowId);
	} else if (op.type === 'bulk-insert') {
		await insertEntries(op.payload.userId, op.payload.rows);
	} else if (op.type === 'bulk-delete') {
```

- [ ] **Step 6: Vérifier que la compilation échoue sur les appelants des stores**

Run: `npm run check`
Expected: FAIL — les stores passent encore `wishlist: true` dans le payload `bulk-insert` (`wishlist-store.ts:70`), qui n'existe plus dans le type. C'est attendu ; Task 3 corrige les stores. Confirmer que les SEULES erreurs concernent `wishlist` dans les payloads de store (pas d'autre régression dans les fichiers modifiés ici).

- [ ] **Step 7: Commit**

```bash
git add src/lib/collection/db/collection.ts src/lib/supabase/sync-queue.ts src/lib/supabase/useSyncQueue.ts
git commit -m "refactor(sync): wishlist flag travels via entry, not parallel params

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Les stores portent `wishlist` dans l'entry

`addToWishlist` met `wishlist: true` dans l'entry construite et n'enqueue plus `wishlist: true` à côté. Restaure `npm run check` au vert.

**Files:**

- Modify: `src/lib/wishlist/store/wishlist-store.ts:60-73` (`addToWishlist`)

**Interfaces:**

- Consumes: op `bulk-insert` sans champ `wishlist` (Task 2) ; `buildEntriesBatch(scryfallId, count, entryPatch)` (existant — propage `entryPatch` via `newEntry`, sans whitelist).
- Produces: les rows wishlist ont `entry.wishlist === true`.

- [ ] **Step 1: `addToWishlist` — `wishlist: true` dans l'entry, pas dans l'op**

Dans `src/lib/wishlist/store/wishlist-store.ts`, remplacer le corps de `addToWishlist` (lignes ~60-73) :

```ts
	addToWishlist: (card, userId, triggerSync, entryPatch, count = 1) => {
		const rows = buildEntriesBatch(card.id, count, { ...entryPatch, wishlist: true });
		set((state) => {
			const next = { ...state.entries };
			for (const { rowId, scryfallId, entry } of rows) {
				next[rowId] = { scryfallId, entry };
			}
			return { entries: next };
		});
		if (userId) {
			enqueue({ type: 'bulk-insert', payload: { userId, rows } });
			triggerSync();
		}
	},
```

(Changements : `{ ...entryPatch, wishlist: true }` passé à `buildEntriesBatch` ; payload `bulk-insert` sans `wishlist: true`.)

- [ ] **Step 2: Vérifier**

Run: `npm run check`
Expected: PASS. Toutes les erreurs de la Task 2 sont résolues. (`changePrint` du même store conserve déjà `copy.entry` intégralement — il préserve `wishlist: true` sans changement. Vérifier visuellement `changePrint` lignes ~99-125 : `updatedCopy = { scryfallId, entry: copy.entry }` → OK, `wishlist` préservé.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/wishlist/store/wishlist-store.ts
git commit -m "refactor(wishlist): store wishlist flag in entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `moveToCollection` devient un flip multi-rows

Remplace l'implémentation v1 (delete+insert) par un flip in-place : un `update` par row avec `wishlist: false` + édition + métadonnées ; mouvement mémoire wishlist-store → collection-store. Casse temporairement les appelants de `page.tsx` (corrigés Task 6).

**Files:**

- Modify: `src/lib/wishlist/context/WishlistContext.tsx` (type + impl `moveToCollection`)

**Interfaces:**

- Consumes: op `update` (payload `{ userId, rowId, entry, scryfallId? }`) qui, via `updateEntry` (Task 2), pose `wishlist` ; `useWishlistStore`/`useCollectionStore` (déjà importés dans ce fichier).
- Produces: `moveToCollection: (rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => void`.

- [ ] **Step 1: Mettre à jour le type dans `WishlistContextValue`**

Dans `src/lib/wishlist/context/WishlistContext.tsx`, le type de `moveToCollection` (actuellement v1 4-args) :

```ts
	moveToCollection: (rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => void;
```

- [ ] **Step 2: Réécrire l'implémentation `moveToCollection`**

Remplacer le `const moveToCollection = useCallback(...)` actuel par :

```ts
const moveToCollection = useCallback(
	(rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => {
		const wishlistEntries = useWishlistStore.getState().entries;
		const colEntries = useCollectionStore.getState().entries;
		const nextWishlist = { ...wishlistEntries };
		const nextCollection = { ...colEntries };

		for (const rowId of rowIds) {
			const copy = wishlistEntries[rowId];
			if (!copy) continue;
			// Flip in place: same rowId, wishlist=false, edition + metadata patched.
			const movedEntry: CardEntry = {
				...copy.entry,
				...entryPatch,
				rowId,
				wishlist: false,
			};
			delete nextWishlist[rowId];
			nextCollection[rowId] = { scryfallId, entry: movedEntry };

			if (userId) {
				enqueue({
					type: 'update',
					payload: { userId, rowId, entry: movedEntry, scryfallId },
				});
			}
		}

		useWishlistStore.setState({ entries: nextWishlist });
		useCollectionStore.setState({ entries: nextCollection });
		if (userId) triggerSync();
	},
	[userId, triggerSync]
);
```

Notes :

- `useWishlistStore` et `useCollectionStore` sont déjà importés en haut du fichier (utilisés ailleurs dans le contexte). Si l'un manque, l'ajouter à l'import existant depuis `../store/wishlist-store` / `@/lib/collection/store/collection-store`.
- `CardEntry` est déjà importé (`import type { CardEntry } from '@/types/cards';`).
- `enqueue` est déjà importé depuis `@/lib/supabase/sync-queue`.
- On ne touche PAS `deck_id` : couplage deck voulu.

- [ ] **Step 3: Vérifier l'échec attendu sur page.tsx**

Run: `npm run check`
Expected: FAIL — `src/app/wishlist/page.tsx` appelle encore `moveToCollection(movingCard.entry.rowId, selectedPrint.id, entry, count)` (4 args, 1er = string). Erreurs de type attendues sur cet appel. Aucune autre erreur dans `WishlistContext.tsx` lui-même.

- [ ] **Step 4: Commit**

```bash
git add src/lib/wishlist/context/WishlistContext.tsx
git commit -m "feat(wishlist): moveToCollection flips wishlist flag in place (no insert/delete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `EditCardModal` — quantité bornée par `maxQuantity`

Permet de caper le champ quantité à la taille du stack wishlist.

**Files:**

- Modify: `src/lib/card/components/EditCardModal/EditCardModal.tsx` (`AddProps`, input quantité)

**Interfaces:**

- Consumes: rien de nouveau.
- Produces: `AddProps` accepte `maxQuantity?: number`. L'input quantité a `max={maxQuantity}` et clamp à `Math.min(maxQuantity ?? Infinity, Math.max(1, n))`.

- [ ] **Step 1: Ajouter `maxQuantity` à `AddProps`**

Dans `AddProps`, après `hideQuantity?: boolean;` :

```ts
	maxQuantity?: number;
```

- [ ] **Step 2: Borner l'input quantité**

Remplacer l'input quantité (lignes ~199-207) :

```tsx
<input
	id="copy-add-quantity"
	type="number"
	min={1}
	max={props.maxQuantity}
	step={1}
	className={styles.select}
	value={quantity}
	onChange={(e) => {
		const n = parseInt(e.target.value, 10);
		const clamped = Number.isNaN(n) ? 1 : Math.max(1, n);
		setQuantity(props.maxQuantity ? Math.min(props.maxQuantity, clamped) : clamped);
	}}
/>
```

(`props` est de type `AddProps` ici car cet input est rendu sous `addMode && !props.hideQuantity`.)

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: PASS. `maxQuantity` est optionnel ; les appelants existants ne le passent pas → comportement inchangé.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/EditCardModal/EditCardModal.tsx
git commit -m "feat(edit-card-modal): cap add-mode quantity via maxQuantity prop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Page wishlist — stack, quantité capée, appel flip multi-rows

Adapte la page au flip : on déplace les `N` premières rows du stack, quantité bornée à la taille du stack. Restaure `npm run check` au vert.

**Files:**

- Modify: `src/app/wishlist/page.tsx`

**Interfaces:**

- Consumes: `moveToCollection(rowIds, scryfallId, entryPatch)` (Task 4) ; `EditCardModal` avec `maxQuantity` (Task 5) ; `buildInitialEntry` (existant) ; `cardByRowId`, `stacks` (existants).
- Produces: comportement final (terminal).

- [ ] **Step 1: Remplacer le state `movingCard` par `movingStack`**

Dans `src/app/wishlist/page.tsx`, remplacer la déclaration `const [movingCard, setMovingCard] = useState<Card | null>(null);` par :

```ts
const [movingStack, setMovingStack] = useState<CardStack | null>(null);
```

(`CardStack` est déjà importé depuis `@/types/cards`.)

- [ ] **Step 2: `handleRequestMove` ouvre le stack**

Remplacer le `handleRequestMove` actuel (qui résout une `Card` via `cardByRowId`) par une résolution du stack contenant ce rowId :

```ts
const stackByRowId = useMemo(() => {
	const map = new Map<string, CardStack>();
	for (const stack of stacks) {
		for (const card of stack.cards) map.set(card.entry.rowId, stack);
	}
	return map;
}, [stacks]);

const handleRequestMove = useCallback(
	(rowId: string) => {
		const stack = stackByRowId.get(rowId);
		if (stack) setMovingStack(stack);
	},
	[stackByRowId]
);
```

Si `cardByRowId` n'est plus utilisé ailleurs après ce changement, le supprimer pour éviter un warning ESLint « unused ». (Vérifier : `cardByRowId` n'est référencé que par l'ancien `handleRequestMove`.)

- [ ] **Step 3: Rendre la modale avec `maxQuantity` et l'appel flip**

Remplacer le bloc `{movingCard && (<EditCardModal ... />)}` (lignes ~256-268) par :

```tsx
{
	movingStack && movingStack.cards[0] && (
		<EditCardModal
			mode="add"
			scryfallCard={movingStack.cards[0] as ScryfallCard}
			initialEntry={buildInitialEntry(movingStack.cards[0].entry)}
			maxQuantity={movingStack.cards.length}
			onAdd={(selectedPrint, entry, count) => {
				const rowIds = movingStack.cards.slice(0, count).map((c) => c.entry.rowId);
				moveToCollection(rowIds, selectedPrint.id, entry);
				setMovingStack(null);
				handleCloseModal();
			}}
			onClose={() => setMovingStack(null)}
		/>
	);
}
```

- [ ] **Step 4: Vérifier**

Run: `npm run check`
Expected: PASS. Plus d'erreur sur `moveToCollection` (appel à 3 args avec `rowIds: string[]`). Plus de référence à `movingCard`/`setMovingCard`. Pas de variable inutilisée.

- [ ] **Step 5: Test manuel**

1. `npm run dev`, se connecter, `/wishlist` avec une carte ayant ≥2 copies wishlist.
2. Clic droit → « Déplacer vers la collection » : modale ouverte, quantité bornée (max = nombre de copies du stack).
3. Régler quantité = 2, changer foil + édition → confirmer.
4. Vérifier en base (Supabase Studio, table `cards`) : les 2 rows ont **le même `id` qu'avant** (pas de nouveau rowId), `wishlist = false`, le nouveau `scryfall_id`. Aucune row supprimée, aucune créée.
5. Vérifier l'UI : les cartes quittent la wishlist et apparaissent en collection immédiatement.
6. Cas carte de deck wishlistée : après flip, elle apparaît en collection ET reste dans le deck (même row, `deck_id` intact, `wishlist=false`).
7. Régression : ajouter une carte à la wishlist (doit toujours arriver avec `wishlist=true`), et un ajout collection normal (doit avoir `wishlist=false`).

- [ ] **Step 6: Commit**

```bash
git add src/app/wishlist/page.tsx
git commit -m "feat(wishlist): move-to-collection flips stack rows with capped quantity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage :**

- Spec §1 (`cardEntryToRow` sérialise `wishlist`) → Task 1. ✓
- Spec §2 (retirer params parallèles ; `updateEntry` pose `wishlist`) → Task 2. ✓
- Spec §3 (stores portent `wishlist` ; `addToWishlist`, `changePrint`) → Task 3 (R2 `newEntry`/`changePrint` vérifiés). ✓
- Spec §4 (`moveToCollection` flip multi-rows) → Task 4. ✓
- Spec §5 (`maxQuantity` sur `EditCardModal`) → Task 5. ✓
- Spec §6 (page : `movingStack`, quantité capée, `moveToCollection(rowIds,…)`) → Task 6. ✓
- Spec « fichiers touchés » : cardRow.ts (T1), collection.ts + sync-queue.ts + useSyncQueue.ts (T2), wishlist-store.ts (T3), WishlistContext.tsx (T4), EditCardModal.tsx (T5), page.tsx (T6). `card/entry/*` non touché (R2 résolu). ✓
- Spec « non-objectifs » : pas de découplage deck (T4 ne touche pas `deck_id`) ; édition appliquée aux rows flippées (T4 `scryfallId` dans l'update). ✓
- Spec R3 (pas de migration) : aucune tâche schéma — colonne `wishlist` préexiste. ✓

**2. Placeholder scan :** Aucun TBD/TODO ; chaque step montre le code réel et la commande exacte. Les FAIL attendus (T2 Step 6, T4 Step 3) sont des transitions documentées, pas des placeholders. ✓

**3. Type consistency :**

- `cardEntryToRow` → `{ …, wishlist: boolean }` (T1) consommé implicitement par insert/update (T2). ✓
- `insertEntry(userId, scryfallId, entry)` / `insertEntries(userId, rows)` (T2) ↔ appels dans useSyncQueue (T2 Step 5). ✓
- `moveToCollection(rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>)` cohérent T4 (déclaration) ↔ T6 Step 3 (appel `moveToCollection(rowIds, selectedPrint.id, entry)`). ✓
- `maxQuantity?: number` cohérent T5 (déclaration) ↔ T6 (`maxQuantity={movingStack.cards.length}`). ✓
- `movingStack: CardStack | null` cohérent T6 Steps 1-3. ✓
- Op `update` payload `{ userId, rowId, entry, scryfallId? }` inchangé — `moveToCollection` (T4) le remplit, `updateEntry` (T2) le consomme. ✓
