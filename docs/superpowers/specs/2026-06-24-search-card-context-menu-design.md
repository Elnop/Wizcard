# Menu clic droit sur les cartes de recherche + champ Quantité dans tous les flux d'ajout

**Date :** 2026-06-24

## Contexte

La page `/search` affiche des cartes (officielles Scryfall, custom MPC, cardbacks) via `CardList`.
Le clic gauche ouvre la `CardModal`. Il n'existe aucun menu contextuel sur la recherche, alors
que l'infrastructure existe déjà (`ContextMenu`, `useContextMenu`, prop `onCardContextMenu` sur
`CardList`/`CardListGrid`, builders de menu type `wishlistCardMenu.ts`).

`EditCardModal` possède déjà un `mode="add"` (condition, foil, proxy, langue, tags, change print)
mais **sans champ quantité** : ajouter 3 copies impose 3 ouvertures du modal.

## Objectif

1. Ajouter un menu clic droit sur les cartes de recherche : voir les détails, ouvrir la page de
   la carte, ajouter à la collection, ajouter à la wishlist.
2. Faire passer les ajouts collection/wishlist par la modale d'ajout existante (`EditCardModal`
   en `mode="add"`) **enrichie d'un champ Quantité**.
3. Le champ Quantité doit apparaître dans **tous** les flux d'ajout (`mode="add"`), pas seulement
   depuis la recherche.

## Comportement

Clic droit sur une carte ouvre un `ContextMenu` dont les items dépendent du type de carte :

| Action                                            | Carte officielle (Scryfall) | Carte custom / cardback |
| ------------------------------------------------- | --------------------------- | ----------------------- |
| 👁 Voir les détails (ouvre `CardModal`)           | ✓                           | ✓                       |
| 🔗 Ouvrir la page de la carte (`/card/{id}`)      | ✓                           | ✗                       |
| ▣ Ajouter à la collection… (ouvre modale d'ajout) | ✓                           | ✗                       |
| ♡ Ajouter à la wishlist… (ouvre modale d'ajout)   | ✓                           | ✗                       |

Le tri custom/officiel utilise `isCustomCard(card)` (`@/lib/mpc/types`). Pour une carte custom,
seul « Voir les détails » est proposé.

### Modale d'ajout avec quantité

« Ajouter à la collection/wishlist » ouvre `EditCardModal` en `mode="add"`. Le formulaire affiche
désormais un champ **Quantité** (entier, min 1, défaut 1) en haut. À la confirmation, le callback
`onAdd` est invoqué **N fois** (N = quantité), créant N copies distinctes — cohérent avec le reste
de l'app où chaque copie a son propre `rowId` (cf. `WishlistContext.addToWishlist`).

## Architecture

### 1. `src/lib/card/components/EditCardModal/EditCardModal.tsx`

- Nouvel état local `const [quantity, setQuantity] = useState(1)`.
- En `mode="add"` uniquement : champ `<input type="number" min={1}>` (label « Quantité ») rendu
  en tête de formulaire, réutilisant les classes CSS `field`/`label`/`select` (ou un input stylé
  équivalent déjà présent).
- `handleConfirmAdd` : `for (let i = 0; i < Math.max(1, quantity); i++) props.onAdd(selectedPrint, draftEntry)`
  avant `props.onClose()`.
- Mode `edit` inchangé (pas de quantité). Aucune nouvelle prop : tous les callers `mode="add"`
  héritent automatiquement du champ. Leurs `onAdd` sont déjà idempotents par copie, donc des
  appels répétés produisent N copies correctement.

Callers `mode="add"` impactés (inchangés côté code, bénéficient du champ) :

- `src/app/card/[id]/components/AddToCollectionButton/AddToCollectionButton.tsx`
- `src/app/card/[id]/components/tabs/PrintsTab/PrintsTab.tsx` (collection + wishlist)
- `src/app/decks/[id]/DeckDetailReadOnlyView.tsx`

### 2. `src/app/search/searchCardMenu.ts` _(nouveau)_

`buildSearchMenuItems(card, handlers, close): ContextMenuAction[]`, pattern de `wishlistCardMenu.ts`.

```ts
type SearchCardMenuHandlers = {
	onViewDetails: (card: AnyCard) => void;
	onOpenCardPage: (card: AnyCard) => void;
	onAddToCollection: (card: AnyCard) => void;
	onAddToWishlist: (card: AnyCard) => void;
};
```

- Toujours : « Voir les détails ».
- Si `!isCustomCard(card)` : ajoute « Ouvrir la page de la carte », divider, « Ajouter à la
  collection… », « Ajouter à la wishlist… ».
- Chaque `onClick` appelle le handler puis `close()`.

### 3. `src/app/search/page.tsx`

- `const cardMenu = useContextMenu<AnyCard>()`.
- `const router = useRouter()` (`next/navigation`).
- État `const [addModal, setAddModal] = useState<{ card: ScryfallCard; target: 'collection' | 'wishlist' } | null>(null)`.
- `<CardList onCardContextMenu={(card, e) => cardMenu.open(card, e)} … />`.
- Rendu conditionnel `<ContextMenu items={buildSearchMenuItems(cardMenu.menu.data, handlers, cardMenu.close)} … />`
  avec handlers :
  - `onViewDetails: setSelectedCard`
  - `onOpenCardPage: (c) => router.push('/card/' + c.id)`
  - `onAddToCollection: (c) => setAddModal({ card: c as ScryfallCard, target: 'collection' })`
  - `onAddToWishlist: (c) => setAddModal({ card: c as ScryfallCard, target: 'wishlist' })`
- Rendu `<EditCardModal mode="add" scryfallCard={addModal.card} onAdd={(card, entry) =>
addModal.target === 'collection' ? addCard(card, entry) : addToWishlist(card, entry)}
onClose={() => setAddModal(null)} />`.

## Hors périmètre (YAGNI)

- Cartes custom / cardbacks : pas d'ajout collection/wishlist ni de page carte (non supporté côté
  données Scryfall).
- Pas de champ quantité en mode `edit`.
- Pas d'entrée unique avec compteur : N copies = N entrées (comportement existant de l'app).

## Tests / vérification

- `npm run check` (TS + ESLint + Prettier).
- Vérif manuelle : clic droit carte officielle → 4 items ; carte custom → 1 item ; ajout avec
  quantité 3 → 3 copies dans la collection/wishlist ; les flux d'ajout existants (page carte,
  deck) affichent le champ Quantité.
