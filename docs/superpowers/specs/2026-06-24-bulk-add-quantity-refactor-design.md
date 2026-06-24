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

- La **fabrication des N entries** vit dans **une seule unité pure et partagée**
  (`buildEntriesBatch`), pas réimplémentée dans chaque store.
- Le **store** ne fait que : insérer ces entries dans son état + enqueuer **une** op
  `bulk-insert`. Collection et wishlist deviennent symétriques (seul le flag `wishlist` diffère).
- `EditCardModal` n'a **qu'un** mécanisme d'ajout : il transmet `(print, entry, count)` une seule
  fois (plus de boucle).
- Chaque call-site mappe ce callback vers `addCards` (collection) / `addToWishlist`-bulk
  (wishlist), suivi de son effet de bord UI propre (feedback, fermeture de modale, …).

## Frontières des unités

| Unité                                       | Responsabilité unique                                    | Dépend de                | Test isolé |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------ | ---------- |
| `buildEntriesBatch` + `newEntry` (partagés) | fabriquer N `{rowId, scryfallId, entry}` ; clamp `count` | `CardEntry`, `crypto`    | ✅ pur     |
| `insertEntries(userId, rows, wishlist)`     | 1 INSERT batch Supabase                                  | `cardEntryToRow`, client | ✅ mapping |
| op `bulk-insert` + `executeOp`              | transporter `wishlist` jusqu'à la db                     | types                    | ✅ type    |
| collection store `addCards`                 | état + enqueue (collection)                              | `buildEntriesBatch`      | ✅         |
| wishlist store `addToWishlist`              | état + enqueue (wishlist)                                | `buildEntriesBatch`      | ✅         |
| `EditCardModal` (add)                       | UI : `onAdd(print, entry, count)` ×1                     | —                        | check      |
| call-sites (×5)                             | mapper onAdd → store + effet UI local                    | contexts                 | check      |

## Architecture

### 0. Unité partagée : `buildEntriesBatch` (+ mutualisation de `newEntry`)

`newEntry` est **actuellement dupliqué à l'identique** dans `collection-store.ts` (l.17) et
`wishlist-store.ts` (l.12). On le déplace dans un module de domaine partagé et on ajoute la
fabrication en lot par-dessus.

**`src/lib/card/entry/buildEntriesBatch.ts`** _(nouveau)_ :

```ts
import type { CardEntry } from '@/types/cards';

export function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}

/** Fabrique N entries distinctes (rowId unique chacune) pour une même carte. Pur. */
export function buildEntriesBatch(
	scryfallId: string,
	count: number,
	entryPatch?: Partial<CardEntry>
): Array<{ rowId: string; scryfallId: string; entry: CardEntry }> {
	const n = Math.max(1, Math.floor(count) || 1);
	const rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }> = [];
	for (let i = 0; i < n; i++) {
		const rowId = crypto.randomUUID();
		rows.push({ rowId, scryfallId, entry: newEntry(rowId, entryPatch) });
	}
	return rows;
}
```

Les deux stores **importent** `newEntry` depuis ce module (suppression des deux copies locales).
Le clamp de quantité vit ici, en un seul endroit (ni le modal ni les stores ne le redéfinissent).

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

Implémentation : `const rows = buildEntriesBatch(card.id, count, entryPatch)` ; set optimiste de
toutes les entries en une fois (étaler `rows` dans `state.entries`) ; puis **un seul**
`enqueue({ type: 'bulk-insert', payload: { userId, rows } })` + `triggerSync()`. Le store ne
contient **aucune** génération de rowId ni clamp — tout vient de `buildEntriesBatch`.

**`src/lib/wishlist/store/wishlist-store.ts`** — `addToWishlist` gagne un paramètre `count`
(défaut 1, pour rétrocompat des appels existants) et utilise le **même** `buildEntriesBatch`, puis
enqueue `bulk-insert` avec `wishlist: true`. Le corps est symétrique à `addCards` au flag près.
Si `count === 1`, le comportement observable est identique à aujourd'hui (1 ligne via bulk-insert).
Les deux stores importent `newEntry` depuis `buildEntriesBatch.ts` (copies locales supprimées).

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
boucle disparaît). Le champ Quantité reste avec son clamp d'input UI (`min=1`, on ne tape pas 0) ;
mais la sûreté du clamp est désormais garantie en amont par `buildEntriesBatch` — le modal n'a
plus à dédupliquer cette responsabilité.

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
  - `buildEntriesBatch` (unité pure — le test le plus important) : `count = 3` ⇒ 3 entries, 3
    rowId **distincts**, `scryfallId` correct, `entryPatch` appliqué sur chaque entry ; clamp
    `count = 0` / négatif / NaN / `2.7` ⇒ 1 / 1 / 1 / 2 entrées.
  - collection store `addCards(card, 3, …)` : 3 entries dans l'état, enqueue exactement **une** op
    `bulk-insert` de 3 lignes, sans `wishlist`.
  - wishlist store `addToWishlist(card, patch, 3)` : 3 entries, **une** op `bulk-insert` avec
    `wishlist: true`.
  - `insertEntries` : le mapping de ligne inclut `wishlist` (true/false). Si non testable sans
    client Supabase, couvert au niveau store + vérif manuelle réseau.
- **`npm run check`** (tsc + ESLint + Prettier).
- **Manuel** : ajout quantité 3 depuis la recherche (collection ET wishlist) ⇒ 3 copies, et
  vérifier dans l'onglet réseau qu'**un seul** INSERT part. Vérifier que les autres flux d'ajout
  (page carte, deck) fonctionnent toujours.
