# Modale d'édition au déplacement wishlist → collection

**Date:** 2026-06-28
**Statut:** Design révisé (v2 — flip + unification du flag `wishlist`)

## Problème

Sur la page wishlist, l'option « Déplacer vers la collection » (menu contextuel
et bouton du `CardModal`) doit ouvrir une **modale d'édition** pré-remplie
(quantité, proxy, foil, langue, condition, édition, tags), puis confirmer le
déplacement.

Le déplacement lui-même ne doit **pas** créer/supprimer de rows : une carte de
wishlist et la même carte en collection sont la **même row** ; déplacer = passer
sa colonne `wishlist` de `true` à `false`. Le couplage avec un deck (une carte
de deck wishlistée) est **voulu** : flipper le flag la fait apparaître en
collection tout en restant carte de deck (même row).

## Décisions

- **Modale réutilisée :** `EditCardModal` en mode `add` (déjà fait en v1, prop
  `initialEntry`).
- **Déplacement = flip `wishlist: false`** sur les rows existantes. Aucun
  insert, aucun delete.
- **Quantité :** capée à la taille du stack wishlist de la carte. Déplacer `N`
  copies = flipper les `N` premières rows du stack.
- **Édition :** changement conservé → le flip pose aussi `scryfall_id` sur les
  rows flippées (couplage deck assumé).
- **Modèle de données unifié :** `wishlist` devient un champ de premier ordre de
  `CardEntry`, sérialisé/désérialisé par `cardEntryToRow`/`rowToCardEntry`. On
  **supprime** les paramètres/payloads `wishlist` parallèles (ops `insert`,
  `bulk-insert`, fonctions `insertEntry`/`insertEntries`).
- **Garde-fou :** le champ `wishlist` est préservé via l'entry en mémoire. Les
  patchs font `{ ...entry, ...patch }` sans écraser `wishlist` ; `rowToCardEntry`
  peuple déjà `entry.wishlist` à l'hydratation.

## État du code (pré-v2)

- `CardEntry.wishlist?: boolean` existe déjà (`src/types/cards.ts`).
- `rowToCardEntry` **lit** déjà `wishlist` (`cardRow.ts:75`).
- `cardEntryToRow` **n'écrit pas** `wishlist` (`cardRow.ts:88-104`) — il est
  ajouté par l'appelant.
- En écriture, `wishlist` est un **paramètre séparé** :
  - `insertEntry(userId, scryfallId, entry, wishlist=false)` et
    `insertEntries(userId, rows, wishlist=false)` (`collection/db/collection.ts`)
    posent la colonne via `{ ...cardEntryToRow(...), owner_id, wishlist }`.
  - Ops `insert`/`bulk-insert` portent un `wishlist?` à côté de l'entry
    (`sync-queue.ts`), propagé dans `useSyncQueue.ts:44,49`.
  - `wishlist-store.addToWishlist` enqueue `bulk-insert` avec `wishlist: true`.
  - `updateEntry` **ne touche pas** la colonne `wishlist` → l'op `update`
    actuelle ne peut pas flipper le flag.

C'est la double-source de vérité que la v2 supprime.

## Conception

### 1. `cardEntryToRow` sérialise `wishlist`

`src/lib/card/db/cardRow.ts` — ajouter au retour de `cardEntryToRow` :

```ts
wishlist: entry.wishlist ?? false,
```

Et mettre à jour le commentaire d'en-tête (lignes 83-87) : `wishlist` n'est plus
« added by the caller » — il fait partie du payload commun. Seul `owner_id`
reste ajouté par l'appelant (table-specific).

### 2. Retirer les paramètres `wishlist` parallèles

`src/lib/collection/db/collection.ts` :

- `insertEntry(userId, scryfallId, entry)` — retirer le paramètre `wishlist` ;
  le row devient `{ ...cardEntryToRow(scryfallId, entry), owner_id: userId }`
  (la colonne `wishlist` vient maintenant de `cardEntryToRow`).
- `insertEntries(userId, rows)` — idem : retirer le paramètre `wishlist`, le map
  devient `{ ...cardEntryToRow(r.scryfallId, r.entry), owner_id: userId }`.
- `updateEntry` — aucun changement de signature : il appelle `updateCardRow`
  avec un payload qui doit désormais **inclure** `wishlist`. Ajouter au payload :
  `wishlist: entry.wishlist ?? false`. (C'est ce qui rend le flip possible :
  l'op `update` portera `wishlist: false` via l'entry patchée.)

`src/lib/supabase/sync-queue.ts` :

- `insert` payload — retirer `wishlist?: boolean`.
- `bulk-insert` payload — retirer `wishlist?: boolean`.
- (`update` payload — inchangé : il porte déjà `entry`, qui contient
  `wishlist`.)

`src/lib/supabase/useSyncQueue.ts` :

- `insert` → `await insertEntry(userId, scryfallId, entry)` (plus de 4ᵉ arg).
- `bulk-insert` → `await insertEntries(userId, rows)` (plus de 3ᵉ arg).

### 3. Les stores portent `wishlist` dans l'entry

`src/lib/wishlist/store/wishlist-store.ts` :

- `addToWishlist` — les rows construites par `buildEntriesBatch` doivent porter
  `entry.wishlist = true`. Passer `{ ...entryPatch, wishlist: true }` à
  `buildEntriesBatch`, et enqueue `bulk-insert` **sans** `wishlist: true`.
- `changePrint` — l'entry conservée doit garder `wishlist: true` (elle vient du
  store, déjà hydratée avec `wishlist: true`). Vérifier que le patch ne l'écrase
  pas.

`src/lib/collection/store/collection-store.ts` :

- `addCard`/`addCards` — les entries collection portent `wishlist` absent/false.
  `newEntry`/`buildEntriesBatch` ne posent pas `wishlist`, donc
  `cardEntryToRow` écrira `false`. ✓ (vérifier qu'aucun patch n'injecte
  `wishlist: true`).

> Vérifié : `newEntry(rowId, overrides)` fait `{ rowId, dateAdded, ...overrides }`
> — il ne whiteliste pas, donc un `wishlist: true` passé via `entryPatch` est
> propagé tel quel. Aucune modification de `src/lib/card/entry/` nécessaire.

### 4. `WishlistContext.moveToCollection` — flip multi-rows

Signature v2 :

```ts
moveToCollection: (
	rowIds: string[],
	scryfallId: string,
	entryPatch: Partial<CardEntry>
) => void;
```

Implémentation (par row) :

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
				rowId, // identity preserved
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

Points clés :

- **Aucun insert/delete** : un seul `update` par row, qui porte `wishlist: false`
  (via `updateEntry` étendu en §2) + `scryfall_id` + métadonnées.
- **`entryPatch`** ne doit pas contenir `wishlist`, `rowId`, `dateAdded`,
  `deckId`, `ownerId` (la page les exclut — cf. §6).
- **`dateAdded` préservée** (vient de `copy.entry`).
- **Mouvement mémoire** : la row quitte `wishlist-store` et entre dans
  `collection-store` immédiatement (l'UI reflète le déplacement sans
  re-hydratation). `owner_id` est déjà `= moi` sur ces rows (filtre wishlist :
  `wishlist=true AND owner_id=moi`), donc l'`update` (matché sur `owner_id+id`)
  trouvera bien la row.

> Le cas « carte de deck wishlistée » n'a plus de branche spéciale : couplage
> voulu. Sa row a `owner_id=moi` ET `deck_id` ; le flip pose `wishlist=false`,
> elle apparaît en collection et reste carte de deck (même row). On **ne**
> supprime **pas** son `deck_id`.

### 5. `EditCardModal` — quantité capée

`EditCardModal` (mode add) expose un champ quantité. Il faut le **borner** au
maximum fourni. Ajouter une prop optionnelle `maxQuantity?: number` à `AddProps` :

- l'input quantité a `max={maxQuantity}` et le setter clamp à
  `Math.min(maxQuantity, Math.max(1, n))`.
- si `maxQuantity` absent → comportement actuel (pas de borne haute).

### 6. Page wishlist — orchestration

`src/app/wishlist/page.tsx` :

- State `movingStack: CardStack | null` (on a besoin du stack entier pour
  connaître ses rowIds et la quantité max), au lieu de `movingCard`.
- `handleRequestMove(rowId)` résout le **stack** contenant ce rowId et l'ouvre.
- À la confirmation : `rowIds = movingStack.cards.slice(0, count).map(c => c.entry.rowId)` ;
  appeler `moveToCollection(rowIds, selectedPrint.id, entryPatch)`.
- `buildInitialEntry` (déjà présent) strippe `rowId/dateAdded/deckId/ownerId/wishlist`.
- `maxQuantity = movingStack.cards.length` passé à `EditCardModal`.
- À la confirmation : fermer la modale (`setMovingStack(null)`) et le CardModal
  (`handleCloseModal()`).

## Flux complet

1. Utilisateur clique « Déplacer vers la collection » (menu ou CardModal).
2. La page résout le **stack** de cette carte et ouvre `EditCardModal` (mode
   `add`), pré-rempli, quantité bornée à la taille du stack.
3. Utilisateur ajuste quantité / foil / proxy / langue / condition / édition /
   tags puis confirme.
4. `moveToCollection(rowIds, selectedPrint.id, entryPatch)` flippe les `N` rows :
   un `update` par row avec `wishlist=false` + `scryfall_id` + métadonnées ;
   mouvement mémoire wishlist-store → collection-store.
5. Les modales se ferment.

## Non-objectifs

- Pas de modification des autres options du menu contextuel.
- Le changement d'édition s'applique aux rows flippées (couplage deck inclus).
- Pas de découplage deck : la row reste partagée — voulu.

## Fichiers touchés

- `src/lib/card/db/cardRow.ts` — `cardEntryToRow` sérialise `wishlist`.
- `src/lib/collection/db/collection.ts` — `insertEntry`/`insertEntries` perdent
  le param `wishlist` ; `updateEntry` ajoute `wishlist` au payload.
- `src/lib/supabase/sync-queue.ts` — retirer `wishlist?` des payloads
  `insert`/`bulk-insert`.
- `src/lib/supabase/useSyncQueue.ts` — appels `insertEntry`/`insertEntries` sans
  l'arg `wishlist`.
- `src/lib/wishlist/store/wishlist-store.ts` — `addToWishlist` pose
  `wishlist: true` dans l'entry ; `changePrint` préserve `wishlist`.
- `src/lib/wishlist/context/WishlistContext.tsx` — `moveToCollection` flip
  multi-rows.
- `src/lib/card/components/EditCardModal/EditCardModal.tsx` — prop `maxQuantity`.
- `src/app/wishlist/page.tsx` — state `movingStack`, quantité bornée,
  `moveToCollection(rowIds, …)`.

## Risques / vérifications

- **R1 — update écrit toujours `wishlist`.** Tous les `update` existants
  (changePrint collection, edit copie) écriront `wishlist = entry.wishlist ?? false`.
  Sûr tant que les patchs préservent `entry.wishlist` (garde-fou : entries
  hydratées le portent). À vérifier : `wishlist-store.changePrint` et tout
  chemin d'édition de carte wishlist conservent `wishlist: true`.
- **R2 — résolu.** `newEntry` ne whiteliste pas (`{ rowId, dateAdded, ...overrides }`)
  et `wishlist-store.changePrint` conserve `copy.entry` intégralement. Le champ
  `wishlist` survit dans les deux chemins sans modification.
- **R3 — migration de données :** aucune. La colonne `wishlist` existe déjà
  (`20260527000000_add_wishlist_column.sql`) ; on change seulement quels
  chemins l'écrivent.
