# Confirmation au retrait d'une carte de deck aussi en collection/wishlist

## Contexte

Aujourd'hui, retirer une carte du deck (`removeCardFromDeck`) supprime **entièrement**
la ligne `cards`, même si cette ligne sert aussi de copie de collection (owned) ou
d'entrée wishlist (ligne partagée — voir le modèle de `cards` unique). On perd donc
silencieusement la carte de la collection/wishlist.

Objectif : quand on retire du deck une carte qui est **aussi** en collection ou en
wishlist, afficher une popup proposant de la retirer aussi de ces vues, avec des
valeurs par défaut : wishlist = oui, collection = non. Pour une carte de deck « pure »
(ni owned ni wishlist), le retrait reste direct, sans popup.

## Décisions validées

- Popup seulement si la **copie retirée** est owned (collection) OU wishlist.
- L'action « Remove copy » de l'overlay retire la dernière copie ; on évalue cette
  copie précise.
- owned et wishlist sont **mutuellement exclusifs** : la popup ne montre qu'une seule
  case pertinente.
- Case **décochée** → garder la ligne, juste la détacher du deck (`deck_id = null`) :
  la carte reste en collection/wishlist.
- Case **cochée** → supprimer la ligne entièrement.

## Comportement détaillé

Au retrait d'une copie (rowId) :

1. Lire la copie dans `activeDeckCards[rowId]`.
2. Déterminer son appartenance :
   - `entry.ownerId` défini → membership = `collection`.
   - sinon `entry.wishlist === true` → membership = `wishlist`.
   - sinon → aucune : suppression directe (comportement actuel), pas de popup.
3. Si membership ≠ aucune → ouvrir `RemoveDeckCardModal` (état `pendingRemove`).
4. À la confirmation :
   - `alsoRemove === true` → **delete** : suppression complète (comme aujourd'hui,
     enqueue `deck-card-delete`, retire des stores deck + collection/wishlist).
   - `alsoRemove === false` → **detach** : `deck_id = null` sur la ligne ; la retirer
     du deck store (`activeDeckCards`) mais la **garder** dans le store
     collection/wishlist avec `entry.deckId` effacé.

## Composants

### 1. `RemoveDeckCardModal` (nouveau)

`src/app/decks/[id]/components/RemoveDeckCardModal/` (calqué sur
`AddCardToCollectionModal`).

- Props : `cardName: string`, `membership: 'collection' | 'wishlist'`,
  `onConfirm: (opts: { alsoRemove: boolean }) => void`, `onClose: () => void`.
- Une case à cocher :
  - membership `wishlist` → « Retirer aussi de la wishlist », cochée par défaut.
  - membership `collection` → « Retirer aussi de la collection », décochée par défaut.
- Boutons Annuler / Confirmer.

### 2. Deck store — détacher vs supprimer

`src/lib/deck/store/deck-store.ts`

- `removeCardFromDeck(rowId, triggerSync, mode: 'delete' | 'detach' = 'delete')`.
  - `delete` : inchangé (enqueue `deck-card-delete`, retire de collection store).
  - `detach` :
    - retirer de `activeDeckCards`.
    - mettre à jour le store collection/wishlist sous le **même rowId** avec
      `entry.deckId` effacé (la copie redevient « libre »).
    - persistance :
      - copie **owned** → enqueue `update` (owner-scopé) avec l'entry sans `deckId`
        (réutilise `updateEntry`, qui écrit `deck_id = null`).
      - copie **wishlist** (non-owned, owner_id null) → enqueue `deck-card-update`
        avec `{ deck_id: null }` (filtre par id, pas par owner — cf. bug précédent).
- Le payload `deck-card-update.updates` (sync-queue.ts) reçoit `deck_id?: string | null`.
  `updateDeckCard` passe déjà `updates` tel quel à `.update()`.

### 3. Câblage UI

`src/app/decks/[id]/DeckDetailOwnerView.tsx`

- Nouvel état `pendingRemove: { rowId, cardName, membership } | null`.
- `handleRemoveRequest(rowId)` : calcule la membership de la copie ; si owned/wishlist
  → `setPendingRemove(...)` ; sinon `removeCardFromDeck(rowId)` direct.
- Brancher `handleRemoveRequest` sur l'overlay (`onRemove`) et la modale carte
  (`onRemoveEntry` via `useDeckCardModal`).
- Rendre `RemoveDeckCardModal` quand `pendingRemove` ; `onConfirm` appelle
  `removeCardFromDeck(rowId, alsoRemove ? 'delete' : 'detach')` puis ferme.

## Hors périmètre

- Le retrait en mode bulk (sélection multiple) n'est pas concerné par cette popup.
- L'invariant owned⊕wishlist n'est pas (re)forcé ici ; on s'appuie dessus.

## Vérification (manuelle, local)

1. Carte de deck pure → « Remove » → suppression directe, pas de popup.
2. Carte owned (assignée depuis la collection) → « Remove » → popup, case collection
   **décochée** par défaut. Confirmer sans cocher → carte quitte le deck, reste en
   collection (vérifier `deck_id = null` en DB, ligne conservée). Cocher → ligne
   supprimée (absente de collection).
3. Carte wishlistée → « Remove » → popup, case wishlist **cochée** par défaut.
   Confirmer → ligne supprimée. Décocher puis confirmer → carte quitte le deck, reste
   en wishlist (`deck_id = null`).
4. `npm run check` propre.
