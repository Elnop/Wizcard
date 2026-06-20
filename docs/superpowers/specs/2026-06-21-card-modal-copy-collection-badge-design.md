# Badge d'état de collection sur les copies dans la modale de détail

## Contexte

La modale de détail d'une carte de deck (`CardModal`,
`src/lib/card/components/CardModal/CardModal.tsx`) affiche les copies de la carte
dans des listes groupées par zone (`copySections`, rendues par `CardList` avec
`renderOverlay={renderCopyOverlay}`). Chaque ligne = **une copie unique**
(un `rowId`). Aujourd'hui chaque copie montre seulement des badges métadonnées
(condition, foil, langue) via `CopyCardOverlay` — pas d'indicateur
d'appartenance à la collection.

Sur la **page deck**, chaque carte porte un badge d'état de collection
(`DeckCardOverlay` + `useCollectionBadge`) avec un look distinctif
(pastille colorée : ✓ vert possédé, gris non possédé, 🛒 wishlist, etc.).

**Objectif** : afficher ce badge d'état sur les copies des listes par zone de la
modale, en **réutilisant le look** du badge de la page deck, mais avec une
sémantique **adaptée à une copie unique** (pas un groupe/stack).

## Sémantique par copie

Les états du badge de la page deck (`owned` / `partial` / `locked` / `wishlist` /
`none`) décrivent un **groupe** de copies (`ownedCount/neededCount`,
disponibilité en collection). Pour une **copie unique**, seuls trois états ont du
sens :

- `owned` (✓ vert) — si `copy.entry.ownerId != null` (cette copie précise est
  possédée).
- `wishlist` (🛒) — sinon, si le print de la copie est présent dans la wishlist.
- `none` (gris) — sinon.

Les états `partial` et `locked` ne sont **jamais** produits pour une copie (ce
sont des concepts d'agrégat). On réutilise le type `BadgeState` existant
(`src/app/decks/[id]/components/DeckCardOverlay/useCollectionBadge.ts`).

## Interaction

Le badge **gris** (`none`) d'une copie est **cliquable** : il ouvre la modale de
confirmation d'ajout (`AddCardToCollectionModal`) pour **cette copie précise**.
Le câblage existe déjà : `CardModal` expose `onAddToCollectionFromEntry(rowIds)`
qui, dans `DeckDetailOwnerView`, construit la requête et ouvre la modale. Le
badge gris appelle donc `onAddToCollectionFromEntry([copy.entry.rowId])`.

Les badges `owned` et `wishlist` sont purement indicatifs (pas de clic).

## Décomposition (réutilisation, zéro duplication de logique)

### 1. Composant visuel partagé `OwnershipBadge`

Le rendu du badge (pastille colorée + texte) est aujourd'hui **inline** dans
`DeckCardOverlay.tsx` : maps `BADGE_CLASS_MAP`, `BADGE_TEXT_STATIC`, helper
`getBadgeText`, et le JSX `<span className={ownershipBadge ...}>`.

On extrait la partie **présentational** dans un composant réutilisable :

- Créer `src/lib/card/components/OwnershipBadge/OwnershipBadge.tsx` +
  `OwnershipBadge.module.css`.
- Le CSS contient les classes de pastille actuellement dans
  `DeckCardOverlay.module.css` : `.ownershipBadge`, `.ownershipBadgeGreen`,
  `.ownershipBadgeOrange`, `.ownershipBadgeGrey`, `.ownershipBadgeLocked`,
  `.ownershipBadgeWishlist` (ces classes sont déplacées vers le nouveau module ;
  le module de `DeckCardOverlay` garde uniquement ce qui lui est spécifique :
  `overlay`, `ownershipTooltip*`, `countBadge`).
- Props :
  ```ts
  type OwnershipBadgeProps = {
  	badgeState: BadgeState;
  	/** Pour l'état 'partial' (page deck) : "ownedCount/neededCount". */
  	ownedCount?: number;
  	neededCount?: number;
  	onClick?: () => void;
  	/** Tooltip riche optionnel (page deck) ; absent dans la modale. */
  	children?: React.ReactNode;
  	className?: string;
  };
  ```
- Le composant calcule son texte via la logique `getBadgeText` (déplacée ici) et
  applique la classe via `BADGE_CLASS_MAP` (déplacée ici). Il rend
  `<span className={ownershipBadge + classe}>{texte}{children}</span>`, avec
  `onClick` + curseur pointer quand `onClick` est fourni.

`DeckCardOverlay` **utilise** ce composant à la place de son JSX inline : il
passe `badgeState`, `ownedCount`, `neededCount`, `handleBadgeClick`, et son
tooltip riche (collection + wishlist) en `children`. Le visuel n'existe donc
qu'à un seul endroit ; le tooltip agrégé reste propre à la page deck (non
dupliqué, passé en children).

### 2. État par copie — fonction pure légère

Créer `src/lib/card/components/OwnershipBadge/copyBadgeState.ts` :

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

(Pas de besoin du `useCollectionContext` : l'appartenance d'une copie est portée
par `entry.ownerId`. Seule la détection wishlist nécessite une donnée externe,
fournie sous forme d'un `Set` de scryfallIds par l'appelant.)

### 3. `CardModal` reste découplé — prop render optionnel

`CardModal` ne connaît ni la collection ni la wishlist. On lui ajoute un prop
render optionnel, threadé comme les autres à travers les trois interfaces
(`Props`, `InnerProps`) et la pass-down vers `CardModalInner` :

```ts
renderCopyBadge?: (copy: Card) => React.ReactNode;
```

Dans `renderCopyOverlay`, `CardModal` calcule `renderCopyBadge?.(card)` et le
passe à `CopyCardOverlay` via un nouveau prop `collectionBadge?: React.ReactNode`.
`CopyCardOverlay` possède déjà l'`.overlay` positionné en absolu (et `.badges`
en absolu pour les métadonnées) ; il rend `collectionBadge` comme élément
d'overlay (ex. coin opposé aux badges métadonnées) pour un positionnement
correct. `CardModal` ne fait que transmettre ce que le parent fournit — aucun
couplage à la collection/wishlist.

### 4. `DeckDetailOwnerView` fournit le badge

Le parent possède déjà `wishlistEntries` (ligne 145). Il calcule une fois un
`Set` des scryfallIds wishlist (`new Set(wishlistEntries.map((e) => e.scryfallId))`),
puis passe à `CardModal` :

```tsx
renderCopyBadge={(copy) => {
  const state = getCopyBadgeState(copy, wishlistScryfallIds);
  return (
    <OwnershipBadge
      badgeState={state}
      onClick={
        state === 'none'
          ? () => onAddToCollectionFromEntry([copy.entry.rowId])
          : undefined
      }
    />
  );
}}
```

`onAddToCollectionFromEntry` est le handler déjà câblé qui ouvre
`AddCardToCollectionModal` (feature précédente). Le badge gris réutilise donc le
chemin d'ajout existant.

## Périmètre

### Inclus

- Composant visuel partagé `OwnershipBadge` (extraction depuis `DeckCardOverlay`,
  `DeckCardOverlay` migré dessus).
- Fonction pure `getCopyBadgeState`.
- Prop `renderCopyBadge` sur `CardModal` (3 interfaces + pass-down) + rendu dans
  les listes par zone.
- Câblage `renderCopyBadge` dans `DeckDetailOwnerView`, badge gris → ajout de la
  copie via la modale existante.

### Exclu (YAGNI)

- Pas de tooltip riche par copie (le tooltip collection/wishlist agrégé reste
  spécifique à la page deck).
- Pas de nouvel état de badge ; on réutilise `BadgeState`.
- Pas de nouveau chemin d'ajout : on réutilise `onAddToCollectionFromEntry`.
- Aucun test ajouté (l'utilisateur a retiré les tests du projet pour cette
  série de features).
- Les états `partial`/`locked` ne sont pas calculés pour une copie.

## Vérification

- `npm run check` (tsc + eslint + prettier) doit passer.
- Vérif manuelle : ouvrir la modale de détail d'une carte de deck ; chaque copie
  des listes par zone montre un badge ✓ vert (possédée), 🛒 (wishlist non
  possédée) ou gris (non possédée). Cliquer un badge gris ouvre la modale de
  confirmation d'ajout pour cette copie. Vérifier que la page deck garde son
  badge agrégé inchangé (régression visuelle nulle après extraction de
  `OwnershipBadge`).

## Gestion des cas limites

- Copie possédée : `entry.ownerId != null` → ✓ vert, badge non cliquable.
- Wishlist + possédée : `owned` l'emporte (on teste `ownerId` d'abord).
- `renderCopyBadge` absent (autres usages de `CardModal` hors deck) : aucun badge
  d'état affiché — comportement actuel inchangé.
