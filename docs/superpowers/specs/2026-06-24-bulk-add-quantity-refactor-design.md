# Refactor : ajout de N copies en un seul bulk-insert (DRY)

**Date :** 2026-06-24

## Contexte

La feature « champ Quantité » (mergée) fait que `EditCardModal` appelle son callback `onAdd`
**N fois** en boucle pour ajouter N copies. Chaque appel à `addCard`/`addToWishlist` enqueue une
op `insert` puis `triggerSync()` → la file de sync exécute **N INSERT Supabase séquentiels**.

Pour de petites quantités c'est négligeable, mais c'est gaspilleur pour de grandes quantités et,
surtout, la logique « créer N copies » serait dupliquée à chaque call-site si on la laissait dans
la boucle du modal. L'infrastructure de **bulk-insert** (1 requête pour N lignes) existe déjà
(`importCards` l'utilise) mais ignore le flag `wishlist`.

## Objectif

Centraliser l'ajout-en-quantité dans les stores et router **tous** les flux d'ajout par un
**unique** chemin bulk-insert (1 call DB pour N copies). Aucune logique d'ajout dupliquée, une
seule signature de callback partagée par tous les callers.

## Principe DRY

- Le **store** détient toute la logique « créer N entries + enqueue 1 bulk-insert ».
- `EditCardModal` n'a **qu'un** mécanisme d'ajout : il transmet `(print, entry, count)` une seule
  fois (plus de boucle).
- Chaque call-site mappe ce callback vers `addCards` (collection) / `addToWishlist`-bulk
  (wishlist), suivi de son effet de bord UI propre (feedback, fermeture de modale, …).

## Architecture

### 1. Bulk-insert porte le flag `wishlist`

**`src/lib/supabase/sync-queue.ts`** — l'op `bulk-insert` gagne un champ optionnel :

```ts
type: 'bulk-insert';
payload: {
  userId: string;
  rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>;
  wishlist?: boolean;
};
```

**`src/lib/supabase/hooks/useSyncQueue.ts`** — `executeOp` passe le flag :

```ts
} else if (op.type === 'bulk-insert') {
  await insertEntries(op.payload.userId, op.payload.rows, op.payload.wishlist ?? false);
}
```

**`src/lib/collection/db/collection.ts`** — `insertEntries` accepte et applique le flag :

```ts
export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>,
	wishlist = false
): Promise<void> {
	// … map: { ...cardEntryToRow(r.scryfallId, r.entry), owner_id: userId, wishlist }
}
```

Rétrocompatible : défaut `false` ⇒ `importCards` (collection) inchangé.

### 2. `addCards` dans les stores

**`src/lib/collection/store/collection-store.ts`** — nouvelle méthode :

```ts
addCards: (
  card: ScryfallCard,
  count: number,
  userId: string | null,
  triggerSync: () => void,
  entryPatch?: Partial<CardEntry>
) => void;
```

Implémentation (pattern `importCards`) : pour `n = Math.max(1, Math.floor(count))`, génère `n`
entries (un `crypto.randomUUID()` + `newEntry(rowId, entryPatch)` chacun), set optimiste de toutes
en une fois, puis **un seul** `enqueue({ type: 'bulk-insert', payload: { userId, rows } })` +
`triggerSync()`.

**`src/lib/wishlist/store/wishlist-store.ts`** — `addToWishlist` gagne un paramètre `count`
(défaut 1, pour rétrocompat des appels existants) et bascule sur le même chemin bulk avec
`wishlist: true` dans l'op. Si `count === 1` le comportement observable est identique à
aujourd'hui (1 ligne via bulk-insert).

> Décision : on **n'ajoute pas** une seconde méthode wishlist ; on étend `addToWishlist` avec
> `count` pour rester DRY (un seul point d'entrée d'ajout wishlist). Le single-insert wishlist
> actuel (op `insert`) est remplacé par le chemin bulk-insert même pour `count === 1`.

### 3. Contexts exposent le nouveau chemin

- **`CollectionContext`** : expose `addCards(card, count, entryPatch?)` (bind userId/triggerSync).
  `addCard` reste pour les autres usages ponctuels (decrement +1, etc.).
- **`WishlistContext`** : `addToWishlist(card, entryPatch?, count?)` — signature étendue, défaut
  `count = 1`.

### 4. `EditCardModal` : un seul callback `onAdd` avec `count`

Signature changée (mode add) :

```ts
onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
```

`handleConfirmAdd` appelle `props.onAdd(selectedPrint, draftEntry, count)` **une seule fois** (la
boucle disparaît). Le champ Quantité et le clamp `≥1` restent.

### 5. Call-sites migrés (5)

Tous passent à la signature `(card, entry, count)` et délèguent au store bulk :

| Fichier                      | Nouveau `onAdd`                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `search/page.tsx`            | collection → `addCards(card, count, entry)` ; wishlist → `addToWishlist(card, entry, count)` ; puis `setAddModal(null)` |
| `AddToCollectionButton.tsx`  | `addCards(card, count, entry)` + `setShowFeedback(true)`                                                                |
| `PrintsTab.tsx` (collection) | `addCards(...)` + `setAddingCard(null)`                                                                                 |
| `PrintsTab.tsx` (wishlist)   | `addToWishlist(card, entry, count)` + `setAddingToWishlist(null)`                                                       |
| `DeckDetailReadOnlyView.tsx` | `addCards(...)` + `setAddToCollectionCard(null)`                                                                        |
| `CardModal.tsx` (interne)    | propage `count` à ses props `onAddToCollection`/`onAddToWishlist` (signatures étendues à 3 args)                        |

`CardModal`'s props `onAddToCollection`/`onAddToWishlist` passent de `(card, entry)` à
`(card, entry, count)`. Leurs consommateurs (le cas échéant) sont migrés en même temps.

**Callers `addToWishlist` non impactés.** `count` est ajouté en **dernier** paramètre avec défaut
`1`, donc les appels 2-args existants restent valides sans changement :
`src/app/sets/[code]/components/SetCardsGrid/SetCardsGrid.tsx` et
`src/app/decks/[id]/DeckDetailOwnerView.tsx` continuent d'appeler `addToWishlist(card, entry)`.
Idem pour les appels `addCard(card, entry)` ailleurs : `addCard` est conservé tel quel ; seul le
flux quantité utilise `addCards`.

## Hors périmètre (YAGNI)

- Pas de coalescence inter-cartes (chaque carte garde son bulk-insert ; le batching multi-cartes
  reste le rôle d'`importCards`).
- Pas de changement du schéma DB ni des migrations (`cards.wishlist` existe déjà).
- Pas de UI de progression pour les gros ajouts.

## Tests / vérification

- **Unitaire (`tsx`)** :
  - `insertEntries` : le mapping inclut `wishlist` (true/false) — testable via un faux client ou
    en vérifiant la forme des lignes mappées si extractible ; sinon test au niveau store.
  - collection store `addCards(card, 3, …)` : crée 3 entries distinctes (3 rowId), enqueue
    exactement **une** op `bulk-insert` de 3 lignes.
  - wishlist store `addToWishlist(card, patch, 3)` : 3 entries, **une** op `bulk-insert` avec
    `wishlist: true`.
  - clamp : `count = 0` / négatif / NaN ⇒ 1 entrée.
- **`npm run check`** (tsc + ESLint + Prettier).
- **Manuel** : ajout quantité 3 depuis la recherche (collection ET wishlist) ⇒ 3 copies, et
  vérifier dans l'onglet réseau qu'**un seul** INSERT part. Vérifier que les autres flux d'ajout
  (page carte, deck) fonctionnent toujours.
