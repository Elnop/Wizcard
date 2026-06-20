# Modale de confirmation pour l'ajout d'une carte de deck à la collection

## Contexte

Sur la page d'un deck (`DeckDetailOwnerView`), une carte peut être ajoutée à la
collection depuis **trois points d'entrée**, tous sans confirmation aujourd'hui :

1. **Badge gris** d'appartenance (`DeckCardOverlay` + `useCollectionBadge`),
   état `badgeState === 'none'` : aucune copie de la zone possédée **et** aucune
   copie disponible en collection pour ce print (il peut néanmoins exister une
   wishlist).
2. **Menu clic droit** sur la carte → item « Add to Collection »
   (`DeckCardOverlay`, même prop `onAddToCollectionClick` que le badge).
3. **Modale de détail** (`CardModal`) → bouton « Ajouter à la collection »
   (par copie et en masse), via `onAddToCollectionFromEntry`.

**Comportement actuel** : ces trois entrées appellent directement
`toggleOwned(rowId)` — l'ajout se fait sans confirmation.

**Comportement voulu** : chaque entrée ouvre d'abord la **même** modale de
confirmation. L'ajout ne s'exécute qu'après validation par l'utilisateur.

**Exception** : dans `CardModal`, le bouton par copie est une bascule
(« Ajouter » / « Retirer de la collection »). Seuls les **ajouts** passent par la
modale ; le **retrait** (un-own) reste direct, sans confirmation.

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

- Les **trois** points d'entrée d'ajout à la collection ouvrent la modale au
  lieu d'ajouter directement :
  1. badge gris (`badgeState === 'none'`),
  2. menu clic droit « Add to Collection »,
  3. boutons « Ajouter à la collection » de `CardModal` (par copie + en masse).
- Branchement unique de `AddCardToCollectionModal` dans `DeckDetailOwnerView`,
  piloté par un état partagé.
- À la confirmation : ajout à la collection des `rowIds` retenus (avec flag
  proxy), et retrait de la wishlist des copies correspondantes si l'option est
  cochée.

### Exclu (YAGNI)

- Aucun changement pour les autres états de badge (vert `owned`, orange
  `partial`, `locked`, `wishlist`) — ils conservent leur comportement actuel
  (`onBadgeClick` → print picker).
- Aucune modification du composant `AddCardToCollectionModal` lui-même.
- Le **retrait** de la collection (un-own) dans `CardModal` reste direct, sans
  modale.
- `CardModal` reste un composant générique découplé : il **n'importe pas**
  `AddCardToCollectionModal`. C'est `DeckDetailOwnerView` qui décide d'ouvrir la
  modale dans les callbacks qu'il passe à `CardModal`. (Vérifié :
  `onAddToCollectionFromEntry` n'est consommé que par `DeckDetailOwnerView`.)

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

**Menu clic droit** : l'item « Add to Collection » du menu contextuel
(`buildContextMenuItems`) utilise déjà le **même** prop `onAddToCollectionClick`
que le badge. Il faut lui transmettre le même contexte
(`{ cardName, unownedRowIds, wishlistRowIds }`), calculé au même endroit que pour
le badge dans `DeckCardOverlay` puis passé à `buildContextMenuItems`. Aucun
nouveau prop n'est nécessaire — la nouvelle signature couvre les deux entrées.

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

#### Ouverture de la modale depuis `CardModal`

Le prop `onAddToCollectionFromEntry={(rowIds) => { for (const rowId of rowIds) toggleOwned(rowId); }}`
(lignes ~680-682) est remplacé par une ouverture de la modale. La vue connaît la
carte ouverte (`selectedCards`) ; elle construit `pendingCollectionAdd` à partir
des `rowIds` reçus :

- `cardName` : nom de la carte de la modale ouverte.
- `unownedRowIds` : les `rowIds` reçus (ce sont déjà les copies non possédées,
  cf. ci-dessous le découpage côté `CardModal`).
- `wishlistRowIds` : entrées wishlist (`wishlistEntries`) dont le print
  correspond à la carte — même filtrage que le badge, sur l'ensemble des
  scryfallIds de l'oracle de la carte.

### 3. `CardModal` (composant générique partagé)

`CardModal` reste **découplé** : il n'importe pas `AddCardToCollectionModal`. On
ne change que le câblage des callbacks pour distinguer ajout et retrait.

Aujourd'hui le bouton par copie (lignes ~550-560) appelle
`onAddToCollectionFromEntry([rowId])` aussi bien pour ajouter que pour retirer
(le libellé bascule selon `selectedCard.entry.ownerId`). Comme l'ajout doit
désormais passer par la modale et le retrait rester direct, il faut séparer les
deux chemins. Ajouter un prop optionnel :

```ts
onRemoveFromCollectionEntry?: (rowId: string) => void;
```

Le bouton bascule devient :

```tsx
onClick={() =>
  selectedCard.entry.ownerId
    ? onRemoveFromCollectionEntry?.(selectedCard.entry.rowId)
    : onAddToCollectionFromEntry?.([selectedCard.entry.rowId])
}
```

(Le bouton « Ajouter à la collection » en masse, lignes ~636-642, n'agit que sur
`unownedRowIds` — il reste sur `onAddToCollectionFromEntry` sans changement.)

Côté `DeckDetailOwnerView` :

- `onAddToCollectionFromEntry={(rowIds) => setPendingCollectionAdd(...)}` (ouvre
  la modale, cf. ci-dessus).
- `onRemoveFromCollectionEntry={(rowId) => toggleOwned(rowId)}` (retrait direct,
  inchangé fonctionnellement).

## Mapping des options de la modale

| Option modale          | Action à la confirmation                                |
| ---------------------- | ------------------------------------------------------- |
| Copies (toutes / une)  | détermine `rowIds` (géré par la modale)                 |
| Marquer comme proxy    | `toggleOwned(rowId, true)`                              |
| Retirer de la wishlist | `removeFromWishlist(rowId)` pour chaque `wishlistRowId` |

## Flux

```
[Badge gris]  ─┐
[Clic droit]  ─┤─> DeckCardOverlay calcule { cardName, unownedRowIds, wishlistRowIds }
               │     └─> onAddToCollectionClick(req)
               │
[CardModal     │
 "Ajouter"]   ─┴─> DeckDetailOwnerView calcule req depuis les rowIds + carte ouverte
                     └─> setPendingCollectionAdd(req)
                          └─> rendu <AddCardToCollectionModal>
                               ├─ Annuler  -> setPendingCollectionAdd(null)
                               └─ Ajouter  -> toggleOwned(rowId, asProxy) × rowIds
                                              [+ removeFromWishlist × wishlistRowIds si coché]
                                              -> setPendingCollectionAdd(null)

[CardModal "Retirer"] -> onRemoveFromCollectionEntry(rowId) -> toggleOwned(rowId)  (direct, pas de modale)
```

## Tests

- `DeckCardOverlay` : un clic sur le badge gris appelle `onAddToCollectionClick`
  avec le bon `cardName`, les `unownedRowIds` attendus et les `wishlistRowIds`
  filtrés — et n'appelle **pas** `onBadgeClick`.
- `DeckCardOverlay` : un badge non-gris (ex. `partial`) continue d'appeler
  `onBadgeClick` et non `onAddToCollectionClick`.
- `DeckCardOverlay` : l'item « Add to Collection » du menu clic droit appelle
  `onAddToCollectionClick` avec le même contexte que le badge.
- `CardModal` : le bouton par copie d'une carte **non possédée** appelle
  `onAddToCollectionFromEntry` ; d'une carte **possédée**, appelle
  `onRemoveFromCollectionEntry` (et non l'ajout).
- (Si la suite couvre la vue) confirmation modale → `toggleOwned` appelé pour
  chaque rowId retenu ; option proxy propagée ; `removeFromWishlist` appelé
  uniquement si l'option est cochée. Le retrait via `onRemoveFromCollectionEntry`
  n'ouvre **pas** la modale.

## Gestion des erreurs / cas limites

- `unownedRowIds` vide : ne devrait pas arriver à l'état `none` (sinon il n'y a
  rien à ajouter). La modale désactive déjà le bouton « Ajouter » si
  `unownedRowIds.length === 0`. Par sécurité, ne pas ouvrir la modale si
  `unownedRowIds` est vide.
- Pas de wishlist : `wishlistMatchCount = 0` → l'option « retirer de la
  wishlist » ne s'affiche pas (comportement natif de la modale).
