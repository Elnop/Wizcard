# Section « Main de test » (Sample Hand) — Design

**Date**: 2026-07-06
**Statut**: Approuvé, prêt pour plan d'implémentation

## Objectif

Ajouter sous le panneau `DeckStats` de `/decks/[id]` une section « Main de test » qui
tire une main de 7 cartes aléatoires du mainboard, avec deux actions : **Mulligan**
(re-tirer une nouvelle main de 7) et **Draw** (piocher une carte de plus). Les cartes
s'affichent en vignettes cliquables (ouvrent la CardModal existante). Présent en vue
owner ET en vue read-only (deck public).

## Décisions arbitrées

| Sujet              | Décision                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Pool de tirage** | `cardsByZone.mainboard` uniquement. Commander exclu (démarre en zone de commandement, pas dans la bibliothèque).                   |
| **Taille de main** | 7 cartes fixe au tirage/mulligan. Draw incrémente de 1, sans limite artificielle (jusqu'à épuisement de la bibliothèque).          |
| **Rendu cartes**   | Réutiliser `CardList` en liste plate (`cards: Card[]`), une seule vue `fluid-grid` → pas de toggle, pas de table, pas de sections. |
| **Clic carte**     | `openCardModal(card, { readOnly: true })` via `useCardModalContext()` (provider global, dispo owner + read-only).                  |
| **Mélange**        | Fisher-Yates, à la demande côté client (au clic, jamais au render initial → pas de hydration mismatch avec `Math.random`).         |
| **Vues**           | Owner (`DeckDetailOwnerView`) + read-only (`DeckDetailReadOnlyView`), composant partagé.                                           |
| **Mainboard vide** | La section ne s'affiche pas (`mainboard.length === 0` → `return null`).                                                            |

## Modèle & architecture — 3 unités isolées

### 1. `src/lib/deck/utils/sample-hand.ts` — fonction pure

```ts
import type { Card } from '@/types/cards';

/** Fisher-Yates : retourne une COPIE mélangée, ne mute pas l'entrée. */
export function shuffle(cards: Card[]): Card[];
```

Testable via script tsx jetable (déterminisme via longueur/permutation, pas de seed requis).

### 2. `useSampleHand(mainboard: Card[])` — hook

Co-localisé avec le composant : `src/app/decks/[id]/components/SampleHand/useSampleHand.ts`.

- État : `shuffled: Card[] | null` (null = pas encore tiré), `handSize: number` (défaut 7).
- `deal()` : `shuffled = shuffle(mainboard)`, `handSize = min(7, mainboard.length)`.
- `mulligan()` : identique à `deal()` (nouveau mélange + reset à 7).
- `draw()` : `handSize = min(handSize + 1, mainboard.length)`.
- Dérivés : `hand = shuffled ? shuffled.slice(0, handSize) : []`,
  `canDraw = shuffled !== null && handSize < mainboard.length`,
  `hasHand = shuffled !== null`.
- Si `mainboard` change d'identité (deck édité), réinitialiser `shuffled = null`
  (via `useEffect` sur `mainboard`), pour éviter d'afficher des cartes retirées.

### 3. `src/app/decks/[id]/components/SampleHand/SampleHand.tsx` (+ `.module.css`)

Props : `{ mainboard: Card[] }`.

- Si `mainboard.length === 0` → `return null`.
- Panneau de verre séparé, même DA que DeckStats (`--glass-bg`, `--glass-border`,
  `border-radius: 2px`, titre uppercase `--brass`, `backdrop-filter`). Titre « Main de test ».
- Avant premier tirage (`!hasHand`) : un bouton `Button` « Tirer une main » (`deal`).
- Après tirage :
  - `<CardList cards={hand} viewModes={['fluid-grid']} onCardClick={(c) => openCardModal(c as Card, { readOnly: true })} />`
  - Rangée d'actions : `Button` **Mulligan** (`variant="secondary"`, `mulligan`),
    `Button` **Draw** (`disabled={!canDraw}`, `draw`).
  - Compteur discret : « {hand.length} cartes · bibliothèque : {mainboard.length} ».
- `const { openCardModal } = useCardModalContext();`

## Montage

Dans `DeckDetailOwnerView.tsx` et `DeckDetailReadOnlyView.tsx`, juste après
`<DeckStats stats={stats} warnings={warnings} />` :

```tsx
<SampleHand mainboard={cardsByZone.mainboard} />
```

`cardsByZone` est déjà disponible dans les deux vues (déstructuré du hook de détail).

## Composants/API réutilisés (vérifiés)

- `CardList` (`@/lib/card/components/CardList/CardList`) : accepte `cards: AnyCard[]`
  (liste plate) OU sections ; `viewModes?: CardListViewMode[]` (un seul mode → pas de
  toggle) ; `onCardClick?: (card: AnyCard) => void`.
- `useCardModalContext` (`@/contexts/CardModalProvider`) : `openCardModal(card, { readOnly?: boolean })`.
  Provider global (`Providers.tsx`) → dispo owner + read-only.
- `Button` (`@/components/Button/Button`) : `variant`, `size`, `disabled`, `onClick`, `isLoading`.
- `Card` type : `@/types/cards`. `cardsByZone.mainboard: Card[]` (une entrée par copie physique).

## Cas limites

- Mainboard vide → section masquée.
- `draw` quand `handSize >= mainboard.length` → bouton désactivé (`!canDraw`).
- Mainboard de moins de 7 cartes → main initiale = tout le mainboard, `draw` désactivé d'emblée.
- Deck édité (mainboard change) → main réinitialisée (plus de cartes fantômes).
- `CardList` avec `hand` contenant des doublons (deck a 4× la même carte) : chaque
  copie est une entrée `Card` distincte → s'affiche correctement (keys gérées par CardList).

## Vérification

Pas de framework de test (cf. `project_no_test_framework`). Vérifier via :

- `npm run check` (TS + ESLint + Prettier).
- Runtime `npm run dev` sur `/decks/[id]` : tirer une main, mulligan (nouvelle main),
  draw (8e/9e carte), bouton draw désactivé à épuisement, clic carte ouvre la CardModal,
  section masquée sur deck au mainboard vide, et **mêmes comportements sur un deck public
  en vue read-only**.

## Hors périmètre (YAGNI)

- Taille de main configurable (fixe à 7).
- Simulation de mulligan « London » (bottom N cartes).
- Persistance de la main entre navigations.
- Statistiques de main (probabilité de courbe, etc.).
- Animation de distribution des cartes.
