# Spec — Mode « Backs » et suppression du mode « Tout » dans la recherche

**Date** : 2026-06-12
**Statut** : validé par l'utilisateur

## Objectif

1. Retirer complètement les cardbacks (`card_type = 'cardback'`) des résultats de la page de recherche (`/search`).
2. Leur donner un mode dédié « Backs » dans le `SearchModeSwitcher`.
3. Supprimer le mode « Tout » (`all`) et toute la logique de fusion associée — chaque mode a désormais une seule source de données.

## Contexte actuel

- Les cartes custom MPC portent un `card_type : 'card' | 'token' | 'cardback'` (`src/lib/mpc/types.ts`).
- `queryCustomCards` (`src/lib/supabase/custom-cards.ts`) ne filtre pas sur `card_type` : les cardbacks remontent mélangés aux résultats custom.
- Le sélecteur « Cardbacks » du `CardTypeFilter` rendu dans le `FilterModal` n'est pas câblé côté recherche (filtre mort) ; il sert aux autres consommateurs (ImportModal).
- `SearchMode = 'official' | 'all' | 'custom'` (`src/lib/search/types.ts`). Le mode `all` fusionne résultats Scryfall + custom dans `page.tsx` (`mergedCards`, `resolvedHasMore`, `resolvedLoadMore`, `resolvedIsLoadingMore`).

## Design

### 1. Modes

- `SearchMode = 'official' | 'custom' | 'backs'`.
- Switcher : `Officiel | Custom | Backs`.
- URL : `?mode=custom` / `?mode=backs` ; `official` est le défaut et reste absent de l'URL.
- `parseMode` fait retomber toute valeur inconnue (dont l'ancien `all`) sur `official`.

### 2. Couche données

- `CustomCardQueryFilters` gagne `cardTypes?: CardType[]`.
- `queryCustomCards` applique `.in('card_type', cardTypes)` quand le filtre est fourni.
- Mode `custom` → `cardTypes: ['card', 'token']` (exclusion des cardbacks au niveau requête : pagination et totaux corrects).
- Mode `backs` → `cardTypes: ['cardback']`.

### 3. Simplification de `page.tsx`

- `official` → uniquement `useScryfallCardSearch`.
- `custom` / `backs` → uniquement `useCustomCards` (pas de requête Scryfall en mode non officiel).
- Suppression de `mergedCards` et des trois résolutions à branches (`resolvedHasMore`, `resolvedLoadMore`, `resolvedIsLoadingMore`) : chaque mode expose directement les valeurs de sa source.
- Info résultats : « N cardbacks » en mode `backs` ; comportements existants conservés pour `official` et `custom`.

### 4. Mode Backs — comportement

- Filtres actifs : nom, source custom (`customSourceId`), tags MPC. Les filtres couleurs, type, set, rareté, texte oracle, CMC et oracle_id sont masqués dans le `FilterModal` et ignorés dans la requête.
- Tri par nom par défaut.
- Clic sur une carte → `CardModal` inchangé.

### 5. Nettoyage

- L'option « Cardbacks » du `CardTypeFilter` est conservée pour l'ImportModal mais n'est plus exposée dans le contexte recherche (le switcher fait foi).
- Suppression de toute référence au mode `all` : `types.ts`, `SearchModeSwitcher`, `useSearchFiltersFromUrl`, `page.tsx`.

## Hors scope

- Aucune migration DB, aucun changement d'API.
- Pas de changement dans les pages decks/collection/wishlist (le `CardSearchPanel` des decks n'utilise pas `SearchMode`).

## Tests / vérification

- `npm run check` (TypeScript + ESLint + Prettier).
- Vérification manuelle : les trois modes affichent la bonne source ; aucun cardback en mode `custom` ; `?mode=all` retombe sur Officiel ; filtres masqués en mode Backs.
