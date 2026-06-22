# Option « Aucune » : désassigner une copie de collection d'un deck

## Contexte

La modale `UseCollectionCopyModal`
(`src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.tsx`) est
ouverte depuis `CardModal` via le bouton « Utiliser une carte de la collection »,
dans le contexte `DeckDetailOwnerView`. Elle liste les copies de collection
assignables à une carte du deck.

Sélectionner une copie déclenche :

```
onSelectCollectionCopy(rowId)
  → useDeckCardModal.handleAssignCollectionCopy
    → deck-store.replaceDeckCardWithCollectionCopy
```

`replaceDeckCardWithCollectionCopy` **remplace** la row du deck-card par la row de
la copie de collection, qui devient owned + rattachée au deck (`deckId`, `ownerId`).

## Objectif

Ajouter une option **« Aucune »** dans la modale, qui fait l'opération inverse :
désassigner la copie owned actuellement liée au deck-card, et remplacer ce
deck-card par une **nouvelle copie non-owned** (placeholder).

## Décision produit

Quand on choisit « Aucune » :

- La copie de collection actuellement liée **reste owned**, avec `deckId` remis à
  `undefined`. Elle redevient une carte de collection libre et réapparaît comme
  disponible dans la liste « Utiliser ». (Symétrique de l'assignation.)
- Le deck-card est remplacé par un placeholder **non-owned** : nouvelle row, même
  `scryfallId` (même édition affichée), pas de `ownerId`.

## Architecture

### 1. Action store : `unassignCollectionCopyFromDeckCard`

Dans `src/lib/deck/store/deck-store.ts`, symétrique de
`replaceDeckCardWithCollectionCopy`.

Signature (façade publique + impl avec `userId`/`triggerSync` injectés via le
contexte, comme les autres actions) :

```ts
unassignCollectionCopyFromDeckCard(
  deckCardRowId: string,  // la copie owned actuellement dans le deck
  deckId: string,
  zone: DeckZone,
  userId: string,
  triggerSync: () => void,
)
```

Effets :

1. **Libère la copie de collection.** On retire `deckCardRowId` de
   `activeDeckCards`. On construit `freedEntry = { ...entry, deckId: undefined }`
   (`ownerId` conservé). On met à jour `useCollectionStore` sous le même `rowId`
   et on enqueue `{ type: 'update', payload: { userId, rowId: deckCardRowId,
entry: freedEntry } }`. C'est la logique du mode `detach` existant de
   `removeCardFromDeck`, appliquée à une copie owned.

2. **Crée un placeholder non-owned.** Façon `addCardToDeck` :
   `rowId = crypto.randomUUID()`, `deckId`, `tags = setDeckZone(undefined, zone)`,
   **pas** de `ownerId`, `scryfallId` = celui du deck-card courant. Ajout à
   `activeDeckCards` + `enqueue({ type: SYNC_DECK_CARD_INSERT, payload: { deckId,
scryfallId, entry } })`.

3. Bump `deck.updatedAt`, `triggerSync()`.

Garde : si `deckCardRowId` n'existe pas dans `activeDeckCards`, abort. Si la row
n'est pas owned (`!entry.ownerId`), il n'y a rien à désassigner → abort (l'UI ne
proposera pas l'option dans ce cas, mais on garde la garde par sécurité).

On conserve le `scryfallId` du deck-card courant pour le placeholder, plutôt que
de repartir d'un représentatif : le deck garde la même carte/édition affichée,
juste plus owned.

### 2. Hook `useDeckCardModal`

Nouveau `handleUnassignCollectionCopy()` :

- retrouve `clickedCard` via `selection.clickedRowId` dans `selectedCards` ;
- en dérive la zone (`getDeckZone(clickedCard.entry.tags)`) ;
- appelle l'action store avec `clickedCard.entry.rowId`, `deckId`, `zone`.

Exposé dans le retour du hook.

### 3. `CardModal`

Nouvelle prop optionnelle `onUnassignCollectionCopy?: () => void`, transmise à
`UseCollectionCopyModal`. Câblée depuis `DeckDetailOwnerView` vers
`handleUnassignCollectionCopy`. Dans le callback passé à la modale, après
`onUnassignCollectionCopy()`, fermer la modale (`setUsingCollectionCopy(false)`),
comme pour `onSelectCollectionCopy`.

### 4. UI `UseCollectionCopyModal`

Nouvelle prop `onSelectNone?: () => void`.

Ajouter une entrée « Aucune » sous l'en-tête, **au-dessus** du contenu `CardList`
(bandeau/bouton dédié, pas une fausse carte dans la grille). Affichée seulement si
`currentCollectionRowId` est défini (le deck-card est actuellement une copie
owned) **et** `onSelectNone` fourni. Clic → `onSelectNone()` puis `onClose()`.

Texte indicatif : « Aucune — désassigner cette carte du deck (redevient
non possédée) ». Style aligné sur les boutons d'action existants du module CSS.

## Tests

Test store, façon
`src/lib/deck/store/toggle-owned-collection-sync.test.ts`. Après
`unassignCollectionCopyFromDeckCard` :

- (a) l'ancienne row owned a `deckId === undefined`, `ownerId` conservé, et est
  présente dans `useCollectionStore.entries` ;
- (b) elle n'est plus dans `activeDeckCards` ;
- (c) une nouvelle row existe dans `activeDeckCards` avec le bon `scryfallId`, la
  bonne `zone` (tags), `deckId` correct, et **sans** `ownerId` ;
- (d) events enqueued : un `update` (libération) + un `deck-card-insert`
  (placeholder).

## Hors périmètre

- Pas de changement au flux d'assignation existant.
- Pas de gestion d'un deck-card déjà non-owned (l'option n'est simplement pas
  proposée).
