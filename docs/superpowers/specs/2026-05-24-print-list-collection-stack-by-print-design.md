# Print List — Collection stackée par print

**Date:** 2026-05-24
**Scope:** `PrintList` / `CardPrintPickerModal` — section "Ma collection"

## Contexte

Dans la modale de sélection de print (`CardPrintPickerModal`), la section "Ma collection" liste toutes les copies de la carte possédées. Actuellement chaque copie est une entrée individuelle. Le but est de grouper les copies par print (même `scryfallId`) et d'isoler dans une section "Autre" les copies sans correspondance Scryfall.

## Comportement attendu

### Section "Ma collection"
- Les copies sont groupées en **sous-sections par print** (même `scryfallId`)
- Label de chaque sous-section : `"Nom du set #collector_number (N copies)"`
- Section **"Autre"** pour les copies dont le `scryfallId` n'est pas dans les prints Scryfall chargés (si non vide)
- Ces sous-sections sont imbriquées dans une section parente `"Ma collection (N)"` via le champ `children` de `CardListSection`

### Badge "Utilisé"
- Si une copie a un `assignedToDeckName`, un badge **"Utilisé"** est affiché en haut à gauche de l'image de la carte
- Le badge est `position: absolute; top: 4px; left: 4px`, fond amber/orange, curseur `help`
- Au **hover** du badge, un tooltip (`title`) affiche le nom du deck qui utilise cette copie
- La carte reste **sélectionnable** — le bouton "Utiliser" est toujours présent et fonctionnel (transfert de deck à deck)

## Changements

### `PrintList.types.ts`
- Ajout de `assignedToDeckName?: string` dans `CollectionCopyEntry`
- Nouvelle fonction `groupCollectionByPrint(copies, printMap)` → `CardListSection[]`
  - Une section par `scryfallId` distinct trouvé dans le printMap
  - Une section "Autre" pour les copies sans correspondance (si non vide)

### `PrintList.tsx`
- La construction de la section collection utilise `groupCollectionByPrint` avec `children`
- `renderOverlay` : si `card.entry.assignedToDeckName` est présent, rend le badge en plus du bouton "Utiliser"

### `PrintList.module.css`
- `.assignedBadge` : chip positionné en absolu sur l'image, fond amber, curseur `help`

## Ce qui ne change pas
- Les sections par langue (autres prints Scryfall) restent inchangées
- `CardList`, `CardListGrid`, `CardListSection` — aucun changement (on utilise `children` déjà supporté)
- Le comportement du bouton "Utiliser" est inchangé
