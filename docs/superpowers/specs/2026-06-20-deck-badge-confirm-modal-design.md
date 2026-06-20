# Modale de confirmation au clic sur le badge gris d'une carte de deck

## Contexte

Sur la page d'un deck (`DeckDetailOwnerView`), chaque carte affiche un badge
d'appartenance à la collection (`DeckCardOverlay` + `useCollectionBadge`).

Le badge **gris** correspond à l'état `badgeState === 'none'` : aucune copie de
la zone n'est possédée **et** aucune copie disponible n'existe en collection
pour ce print (il peut néanmoins exister une wishlist).

**Comportement actuel** : cliquer sur le badge gris appelle directement
`onAddToCollectionClick`, qui boucle sur les copies non possédées de la zone et
appelle `toggleOwned(rowId)` immédiatement — l'ajout à la collection se fait
sans confirmation.

**Comportement voulu** : le clic ouvre d'abord une modale de confirmation.
L'ajout ne s'exécute qu'après validation par l'utilisateur.

## Décision

Réutiliser le composant existant `AddCardToCollectionModal`
(`src/app/decks/[id]/components/AddCardToCollectionModal/`), aujourd'hui présent
dans le code mais **jamais importé ni rendu**. Il fournit déjà :

- un résumé (`cardName` + nombre de copies à ajouter),
- une option « toutes les copies non possédées » / « une seule copie » (si > 1),
- une option « marquer comme proxy » (`asProxy`),
- une option « retirer de la wishlist » (`removeWishlist`), affichée uniquement
  si `wishlistMatchCount > 0`, cochée par défaut.

À la confirmation, il renvoie `{ rowIds, asProxy, removeWishlist }`.

## Périmètre

### Inclus

- Le clic sur le badge **gris** (`badgeState === 'none'`) ouvre la modale au
  lieu d'ajouter directement.
- Branchement de `AddCardToCollectionModal` dans `DeckDetailOwnerView`.
- À la confirmation : ajout à la collection des `rowIds` retenus (avec flag
  proxy), et retrait de la wishlist des copies correspondantes si l'option est
  cochée.

### Exclu (YAGNI)

- Aucun changement pour les autres états de badge (vert `owned`, orange
  `partial`, `locked`, `wishlist`) — ils conservent leur comportement actuel
  (`onBadgeClick` → print picker).
- Aucune modification du composant `AddCardToCollectionModal` lui-même.
- Aucun changement au menu contextuel « Add to Collection » (clic droit), qui
  reste tel quel.

## Architecture

### 1. `DeckCardOverlay`

Aujourd'hui, le handler du badge décide localement :

```ts
const handleBadgeClick =
	badgeState === 'none' && onAddToCollectionClick ? onAddToCollectionClick : onBadgeClick;
```

`onAddToCollectionClick` ne reçoit aucun argument et le parent ne fait
qu'appeler `toggleOwned`. Pour ouvrir la modale, le parent a besoin du contexte
de la carte. On change la signature de `onAddToCollectionClick` pour qu'elle
transmette ce contexte :

```ts
onAddToCollectionClick?: (req: {
  cardName: string;
  unownedRowIds: string[];
  wishlistRowIds: string[];
}) => void;
```

Dans `DeckCardOverlay` :

- `cardName` = `group.representative.name`.
- `unownedRowIds` = `zoneCopies.filter((c) => !c.entry.ownerId).map((c) => c.entry.rowId)`
  (les copies de la zone courante sans `ownerId`).
- `wishlistRowIds` = rowIds des entrées wishlist dont le `scryfallId` est dans
  `oracleScryfallIds` (même filtrage que `useCollectionBadge`) :
  `(wishlistEntries ?? []).filter((e) => oracleScryfallIds.includes(e.scryfallId)).map((e) => e.entry.rowId)`.
  Pour l'efficacité, construire un `Set(oracleScryfallIds)` localement.

Le badge gris appelle `onAddToCollectionClick({ cardName, unownedRowIds, wishlistRowIds })`.
Les autres états continuent d'appeler `onBadgeClick`.

### 2. `DeckDetailOwnerView`

Devient propriétaire de l'état de la modale :

```ts
const [pendingCollectionAdd, setPendingCollectionAdd] = useState<{
	cardName: string;
	unownedRowIds: string[];
	wishlistRowIds: string[];
} | null>(null);
```

- Le prop `onAddToCollectionClick` passé à `DeckCardOverlay` devient
  `(req) => setPendingCollectionAdd(req)` (remplace la boucle `toggleOwned`
  actuelle aux lignes ~429-433).
- Rendre la modale quand l'état est non-nul :

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

- `toggleOwned` est déjà disponible (`useDeckContext`) et accepte `(rowId, proxy?)`.
- `removeFromWishlist(rowId)` provient de `useWishlistContext`
  (`src/lib/wishlist/context/WishlistContext.tsx`). `useWishlistContext` est
  déjà utilisé dans la vue (ligne 140 :
  `const { addToWishlist, entries: wishlistEntries } = useWishlistContext();`) —
  il suffit d'ajouter `removeFromWishlist` à la déstructuration.

## Mapping des options de la modale

| Option modale          | Action à la confirmation                                |
| ---------------------- | ------------------------------------------------------- |
| Copies (toutes / une)  | détermine `rowIds` (géré par la modale)                 |
| Marquer comme proxy    | `toggleOwned(rowId, true)`                              |
| Retirer de la wishlist | `removeFromWishlist(rowId)` pour chaque `wishlistRowId` |

## Flux

```
Clic badge gris
  └─> DeckCardOverlay calcule { cardName, unownedRowIds, wishlistRowIds }
       └─> onAddToCollectionClick(req)
            └─> DeckDetailOwnerView: setPendingCollectionAdd(req)
                 └─> rendu <AddCardToCollectionModal>
                      ├─ Annuler  -> setPendingCollectionAdd(null)
                      └─ Ajouter  -> toggleOwned(rowId, asProxy) × rowIds
                                     [+ removeFromWishlist × wishlistRowIds si coché]
                                     -> setPendingCollectionAdd(null)
```

## Tests

- Test unitaire / composant sur `DeckCardOverlay` : un clic sur le badge gris
  appelle `onAddToCollectionClick` avec le bon `cardName`, les `unownedRowIds`
  attendus et les `wishlistRowIds` filtrés — et n'appelle **pas** `onBadgeClick`.
- Vérifier qu'un badge non-gris (ex. `partial`) continue d'appeler `onBadgeClick`
  et non `onAddToCollectionClick`.
- (Si la suite couvre la vue) confirmation modale → `toggleOwned` appelé pour
  chaque rowId retenu ; option proxy propagée ; `removeFromWishlist` appelé
  uniquement si l'option est cochée.

## Gestion des erreurs / cas limites

- `unownedRowIds` vide : ne devrait pas arriver à l'état `none` (sinon il n'y a
  rien à ajouter). La modale désactive déjà le bouton « Ajouter » si
  `unownedRowIds.length === 0`. Par sécurité, ne pas ouvrir la modale si
  `unownedRowIds` est vide.
- Pas de wishlist : `wishlistMatchCount = 0` → l'option « retirer de la
  wishlist » ne s'affiche pas (comportement natif de la modale).
