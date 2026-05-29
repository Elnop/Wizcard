# Design : Sélection par zone dans la modale "Ajouter le deck à la collection"

**Date :** 2026-05-29

## Contexte

La modale `AddDeckToCollectionModal` permet d'ajouter toutes les cartes d'un deck à la collection en une seule action. Actuellement, elle traite toutes les zones indistinctement. L'utilisateur doit pouvoir choisir quelles zones inclure dans l'opération.

## Objectif

Ajouter une section "Zones" dans la modale avec une checkbox par zone présente dans le deck. Chaque zone affiche un indicateur `(X / Y possédées)`. Les zones cochées par défaut sont mainboard, commander et sideboard ; maybeboard est décoché par défaut.

## Structure de la modale

```
Ajouter le deck à la collection

[X cartes à ajouter]          ← reflect uniquement les zones cochées

── Zones ───────────────────────────────
☑ Mainboard    (12 / 60 possédées)
☑ Sideboard    (3 / 15 possédées)
☑ Commander    (1 / 2 possédées)
☐ Maybeboard   (0 / 10 possédées)   ← décoché par défaut

── Options ─────────────────────────────
☑ Seulement les non possédées (16 cartes)
☐ Marquer comme proxy
☑ Supprimer de la wishlist (4 cartes)

        [Annuler]  [Ajouter]
```

## Comportement des zones affichées

- On n'affiche que les zones pour lesquelles le deck contient au moins une carte.
- Les zones affichées sont toujours dans l'ordre : commander → mainboard → sideboard → maybeboard.
- Commander n'apparaît que si le format le supporte (commander/brawl), ce qui est déjà géré en amont via la prop `zones` passée à la modale.

## Compteur par zone `(X / Y possédées)`

- **Y** = nombre total de cartes dans la zone (toutes entrées de deck, sans filtre).
- **X** = nombre de cartes dans la zone dont `ownerId != null` (possédées en collection).
- Ce compteur est statique (ne change pas selon l'option "seulement les non possédées").

## Compteur global "X cartes à ajouter"

- Reflète uniquement les cartes des zones **cochées**.
- Si "seulement les non possédées" est coché : compte les cartes non possédées (`ownerId == null`) des zones cochées.
- Si décoché : compte toutes les cartes des zones cochées.

## Option "seulement les non possédées"

- Reste globale (s'applique à toutes les zones cochées).
- Son compteur affiché entre parenthèses reflète également uniquement les zones cochées.

## Option "Supprimer de la wishlist"

- Reste inchangée : compare les scryfallIds de toutes les cartes du deck (toutes zones) à la wishlist.
- Non filtrée par zone (comportement actuel conservé).

## Valeurs par défaut des zones

| Zone       | Cochée par défaut |
| ---------- | ----------------- |
| commander  | oui               |
| mainboard  | oui               |
| sideboard  | oui               |
| maybeboard | non               |

## Changements de surface

### `AddDeckToCollectionOptions` (type)

Ajouter un champ `zones: DeckZone[]` — liste des zones sélectionnées par l'utilisateur.

### `useAddDeckToCollection` (hook)

- Recevoir `resolvedCards` déjà segmentés par zone (déjà disponible via `getDeckZone`).
- Calculer `ownedCount` et `unownedCount` par zone pour les passer à la modale.
- `execute` filtre les cartes à traiter selon `options.zones`.

### `AddDeckToCollectionModal` (composant)

- Recevoir en props les données par zone : `zoneStats: Record<DeckZone, { total: number; owned: number }>` et `availableZones: DeckZone[]`.
- Gérer l'état local `selectedZones: Set<DeckZone>` initialisé avec mainboard + sideboard + commander (intersecté avec `availableZones`).
- Recalculer `addCount` en tenant compte des zones sélectionnées et de `onlyMissing`.

### `page.tsx` (deck detail)

- Calculer et passer `zoneStats` et `availableZones` à la modale.
- `availableZones` = zones ayant au moins une carte dans `cardsByZone`.

## Hors scope

- Pas de sélection par zone pour la wishlist.
- Pas de granularité par zone pour l'option proxy.
- Pas de modification de la logique d'assignation depuis la collection (`handleAssignAllFromCollection`).
