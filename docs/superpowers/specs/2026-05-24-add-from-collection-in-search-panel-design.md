# Design Spec : Ajout depuis la collection dans le panel de recherche du deck

## Contexte

Dans la page d'un deck, le sidemenu de recherche (`CardSearchPanel`) possède un mode "In collection only" qui filtre les cartes affichées aux seules copies physiques possédées par l'utilisateur.

Actuellement, quand l'utilisateur ajoute une carte au deck depuis ce mode (via le context menu `+ Mainboard` ou via le modal "Add to Deck"), le système crée une nouvelle ligne deck sans lien avec la copie physique de la collection — comme si c'était une carte Scryfall quelconque. La copie de collection reste "libre" dans le store et en DB, non assignée au deck.

L'objectif est que **en mode "in collection only", ajouter une carte au deck assigne automatiquement la copie physique correspondante** plutôt que de créer une ligne deck indépendante.

---

## Comportement cible

### Règle de résolution de copie

Quand l'utilisateur ajoute une carte au deck en mode "in collection" :
1. Chercher parmi les `collectionEntries` la première copie libre (`!entry.deckId`) avec le **même `scryfallId`** (même édition)
2. Si aucune → chercher la première copie libre avec le **même `oracle_id`** (autre édition)
3. Si aucune → fallback : `addCardToDeck` classique (nouvelle ligne deck sans copie physique)

### Points d'entrée concernés

**A) Context menu → `+ Mainboard` / `+ Sideboard` / `+ Maybeboard` / `+ Commander`**

En mode "in collection only", chaque handler de zone :
1. Appelle le resolver avec `(card.id, card.oracle_id, collectionEntries)`
2. Si copie trouvée → `addCardToDeck(deckId, card, zone)` + `collectionContext.assignToDeck(rowId, deckId)`
3. Sinon → `addCardToDeck(deckId, card, zone)` seul

**B) Clic carte → modal → "Confirmer l'ajout"**

Le callback `onAddToCollection` dans `page.tsx` (ligne 277) fait la même branche quand `panelSelectedCard` provient du panel en mode "in collection".

---

## Architecture

### Nouveau fichier : `src/lib/deck/utils/collectionCopyResolver.ts`

Fonction pure exportée :

```typescript
type StoredCopy = { scryfallId: string; entry: CardEntry };

export function findFreeCollectionCopy(
  scryfallId: string,
  oracleId: string,
  entries: Array<{ scryfallId: string; entry: CardEntry }>,
  scryfallIdToOracleId: Map<string, string>
): { rowId: string; scryfallId: string } | null
```

- Cherche d'abord `e.scryfallId === scryfallId && !e.entry.deckId`
- Puis `scryfallIdToOracleId.get(e.scryfallId) === oracleId && !e.entry.deckId`
- Retourne `{ rowId: e.entry.rowId, scryfallId: e.scryfallId }` ou `null`

La map `scryfallIdToOracleId` est construite à partir des `Card` des stacks de collection (qui contiennent `oracle_id` de Scryfall via `useCollectionCards`).

### Fichiers modifiés

**`src/app/decks/[id]/components/CardSearchPanel/SearchCardContextMenu.tsx`**

Nouveaux props :
```typescript
inCollectionOnly: boolean;
collectionEntries: Array<{ scryfallId: string; entry: CardEntry }>;
scryfallIdToOracleId: Map<string, string>;
```

Accède à `useCollectionContext().assignToDeck` via le hook existant.

Chaque handler de zone est conditionné :
```typescript
onClick: () => {
  if (inCollectionOnly) {
    const copy = findFreeCollectionCopy(card.id, card.oracle_id ?? '', collectionEntries, scryfallIdToOracleId);
    if (copy) assignToDeck(copy.rowId, deckId);
  }
  addCardToDeck(deckId, card, 'mainboard');
  onClose();
}
```

**`src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`**

- Construit `scryfallIdToOracleId: Map<string, string>` à partir de `collectionStacks` (déjà disponibles) :
  ```typescript
  const scryfallIdToOracleId = useMemo(() => {
    const map = new Map<string, string>();
    for (const stack of collectionStacks) {
      for (const card of stack.cards) {
        map.set(card.id, stack.oracleId);
      }
    }
    return map;
  }, [collectionStacks]);
  ```
- Passe `inCollectionOnly`, `collectionEntries` (déjà disponible : `entries` du `useCollectionContext()`), et `scryfallIdToOracleId` au `SearchCardContextMenu`.

**`src/app/decks/[id]/page.tsx`**

- Ajoute un state `panelInCollectionOnly: boolean` mis à jour via un nouveau prop/callback de `CardSearchPanel` ou partagé par lift-up.
- Le callback `onAddToCollection` du second `CardModal` (ligne 277) conditionne l'assignation :
  ```typescript
  onAddToCollection={(card, entry) => {
    const zone = (entry.tags?.find((t) => t.startsWith('deck:'))?.replace('deck:', '') as DeckZone) ?? 'mainboard';
    if (panelInCollectionOnly) {
      const copy = findFreeCollectionCopy(card.id, card.oracle_id ?? '', collectionEntries, scryfallIdToOracleId);
      if (copy) assignToDeck(copy.rowId, deckId);
    }
    addCardToDeck(deckId, card, zone);
    setPanelSelectedCard(null);
  }}
  ```
- `collectionEntries` et `scryfallIdToOracleId` sont déjà accessibles via `useCollectionContext()` et un useMemo similaire à celui du panel.

### Alternative pour `panelInCollectionOnly`

`CardSearchPanel` expose `onCollectionModeChange: (v: boolean) => void` prop. La page garde `panelInCollectionOnly` en state local mis à jour par ce callback. Pas de lift-up de state complexe.

---

## Flux de données complet

```
[inCollectionOnly = true]
Utilisateur → "+ Mainboard" (context menu)
  → findFreeCollectionCopy(card.id, card.oracle_id, entries, map)
    → copie trouvée : assignToDeck(rowId, deckId)          ← marque la copie en DB
    → addCardToDeck(deckId, card, 'mainboard')              ← crée la ligne deck
  OU
    → aucune copie : addCardToDeck(deckId, card, 'mainboard') seul

Utilisateur → clic carte → modal → Confirmer
  → même branche dans onAddToCollection (page.tsx)
```

---

## Ce qui ne change pas

- Le mode "in collection = false" (recherche Scryfall) : comportement identique à aujourd'hui
- L'option "Ajouter au deck..." du context menu (qui ouvre le modal) : inchangée, c'est le modal qui gère
- La logique de `addCardToDeck` dans le store : inchangée

---

## Fichiers touchés

| Fichier | Modification |
|---|---|
| `src/lib/deck/utils/collectionCopyResolver.ts` | **Créer** — fonction pure `findFreeCollectionCopy` |
| `src/app/decks/[id]/components/CardSearchPanel/SearchCardContextMenu.tsx` | Nouveaux props + branche resolver dans les handlers de zone |
| `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx` | Construire `scryfallIdToOracleId`, passer props au context menu, exposer `onCollectionModeChange` |
| `src/app/decks/[id]/page.tsx` | State `panelInCollectionOnly`, branche resolver dans `onAddToCollection`, construire `scryfallIdToOracleId` |
