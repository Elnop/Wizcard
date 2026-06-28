# Modale d'édition au déplacement wishlist → collection

**Date:** 2026-06-28
**Statut:** Design validé

## Problème

Sur la page wishlist, l'option « Déplacer vers la collection » (menu contextuel
et bouton du `CardModal`) déplace une copie en silence : elle réutilise
telles quelles les métadonnées existantes de la copie wishlist et l'ajoute à la
collection sans laisser l'utilisateur ajuster quoi que ce soit.

On veut qu'au lieu de déplacer directement, l'action ouvre une **modale
d'édition** pré-remplie qui propose : quantité, proxy, foil, langue, condition,
édition (print) et tags — puis confirme le déplacement.

## Décisions

- **Modale réutilisée :** `EditCardModal` en mode `add`. Il expose déjà
  quantité, foil/foilType, proxy, langue, condition, tags et changement de
  print. Pas de nouvelle modale dédiée.
- **Quantité :** l'action porte sur la **copie cliquée** (son `rowId`). Le champ
  quantité vaut **1** par défaut et reste éditable ; les autres copies du même
  stack restent dans la wishlist.
- **Périmètre :** le menu contextuel **et** le bouton du `CardModal` ouvrent la
  modale (comportement uniforme).

## Conception

### 1. `EditCardModal` — seed des métadonnées en mode `add`

Aujourd'hui, en mode `add`, `draftEntry` est initialisé à
`{ tags: setDeckZone(undefined, initialZone) }` seulement — les autres champs
partent vides.

On ajoute une prop optionnelle à `AddProps` :

```ts
interface AddProps {
	mode: 'add';
	scryfallCard: ScryfallCard;
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	onClose: () => void;
	availableZones?: DeckZone[];
	defaultZone?: DeckZone;
	hideQuantity?: boolean;
	initialEntry?: Partial<CardEntry>; // NEW
}
```

L'initialisation de `draftEntry` en mode `add` fusionne `initialEntry`
par-dessus le `tags` par défaut :

```ts
addMode
	? { tags: setDeckZone(undefined, initialZone), ...props.initialEntry }
	: { ...props.card.entry };
```

Aucun appelant existant ne passe `initialEntry` → comportement inchangé pour
eux.

> Note : on **ne seed pas** `rowId`, `dateAdded`, `deckId`, `ownerId`,
> `wishlist`. La page wishlist construit le `initialEntry` à partir de la copie
> source en retirant ces champs (cf. § 3), sur le même principe que
> `duplicateEntry` dans `WishlistContext`.

### 2. `WishlistContext.moveToCollection` — signature enrichie

Signature actuelle : `moveToCollection(rowId: string)`.

Nouvelle signature :

```ts
moveToCollection: (
  rowId: string,
  scryfallId: string,
  entryPatch: Partial<CardEntry>,
  count: number
) => void;
```

Implémentation :

```ts
const moveToCollection = useCallback(
	(rowId, scryfallId, entryPatch, count) => {
		const copy = store.entries[rowId];
		if (!copy) return;
		const stubCard = { id: scryfallId } as Parameters<typeof collectionStore.addCards>[0];
		collectionStore.addCards(stubCard, count, userId, triggerSync, entryPatch);
		// removeFromWishlist (du contexte) gère déjà le cas deck-card vs wishlist pure.
		removeFromWishlist(rowId);
	},
	[store, collectionStore, userId, triggerSync, removeFromWishlist]
);
```

Points clés :

- On passe par `collectionStore.addCards(card, count, …, entryPatch)` (déjà
  existant) pour gérer la quantité.
- La print ajoutée est `scryfallId` (l'édition choisie dans la modale), pas
  forcément celle de la copie wishlist source.
- On retire la copie source via le `removeFromWishlist` **du contexte** (pas du
  store) pour conserver la logique deck-card existante.

### 3. Page wishlist — orchestration de la modale

Nouveau state local :

```ts
const [movingCard, setMovingCard] = useState<Card | null>(null);
```

Helper pour résoudre la `Card` à partir d'un `rowId` (depuis `stacks`) :

```ts
const cardByRowId = useMemo(() => {
	const map = new Map<string, Card>();
	for (const stack of stacks) {
		for (const card of stack.cards) map.set(card.entry.rowId, card);
	}
	return map;
}, [stacks]);
```

`onMoveToCollection` (menu) et le bouton du `CardModal` n'appellent plus
`moveToCollection` directement : ils ouvrent la modale.

```ts
const handleRequestMove = useCallback(
	(rowId: string) => {
		const card = cardByRowId.get(rowId);
		if (card) setMovingCard(card);
	},
	[cardByRowId]
);
```

Confirmation — construit `initialEntry` à partir de la copie source (sans les
champs d'identité/appartenance) :

```ts
function buildInitialEntry(entry: CardEntry): Partial<CardEntry> {
	const patch: Partial<CardEntry> = { ...entry };
	delete patch.rowId;
	delete patch.dateAdded;
	delete patch.deckId;
	delete patch.ownerId;
	delete patch.wishlist;
	return patch;
}
```

Rendu de la modale :

```tsx
{
	movingCard && (
		<EditCardModal
			mode="add"
			scryfallCard={movingCard as ScryfallCard}
			initialEntry={buildInitialEntry(movingCard.entry)}
			onAdd={(selectedPrint, entry, count) => {
				moveToCollection(movingCard.entry.rowId, selectedPrint.id, entry, count);
				setMovingCard(null);
				handleCloseModal(); // ferme aussi le CardModal s'il était ouvert
			}}
			onClose={() => setMovingCard(null)}
		/>
	);
}
```

Le bouton « Déplacer vers la collection » du `CardModal` (`onMoveToCollection`)
est recâblé sur `handleRequestMove` au lieu de l'ancien déplacement direct.

## Flux complet

1. Utilisateur clique « Déplacer vers la collection » (menu ou CardModal).
2. La page résout la `Card` du `rowId` et ouvre `EditCardModal` (mode `add`),
   pré-rempli avec les métadonnées de la copie + sa print.
3. Utilisateur ajuste quantité / foil / proxy / langue / condition / édition /
   tags puis confirme.
4. `moveToCollection(rowId, selectedPrint.id, entry, count)` :
   - ajoute `count` copies à la collection avec l'édition + métadonnées choisies,
   - retire la copie wishlist source (logique deck-card préservée),
5. Les modales se ferment.

## Non-objectifs

- Pas de modification des autres options du menu contextuel.
- Le changement d'édition s'applique à la copie **ajoutée en collection** ; la
  copie wishlist source est de toute façon supprimée.
- Pas de déplacement « tout le stack » d'un coup (quantité par défaut = 1,
  éditable).
- Aucun refactor non lié.

## Fichiers touchés

- `src/lib/card/components/EditCardModal/EditCardModal.tsx` — prop `initialEntry`.
- `src/lib/wishlist/context/WishlistContext.tsx` — signature `moveToCollection`.
- `src/app/wishlist/page.tsx` — state + orchestration de la modale, recâblage
  des deux points d'entrée.
- `src/app/wishlist/wishlistCardMenu.ts` — inchangé (le handler garde la
  signature `(rowId) => void`).
