# Sample Hand Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une section « Main de test » sous `DeckStats` sur `/decks/[id]` : tire 7 cartes aléatoires du mainboard, avec Mulligan (nouvelle main de 7) et Draw (+1 carte), vignettes cliquables ouvrant la CardModal, en vue owner et read-only.

**Architecture:** Fonction pure `shuffle` (Fisher-Yates) → hook `useSampleHand` (état main + handSize) → composant `SampleHand` réutilisant `CardList` (liste plate, mode fluid-grid) et `openCardModal` du contexte global. Monté après `<DeckStats>` dans les deux vues détail.

**Tech Stack:** Next.js (App Router), React client components, TypeScript strict, CSS Modules. Réutilise `CardList`, `useCardModalContext`, `Button` existants. Aucune dépendance nouvelle.

## Global Constraints

- **Pas de framework de test.** Vérification = `npm run check` (TS + ESLint + Prettier) + scripts jetables `tsx` dans `scratchpad/` (supprimés avant commit) + runtime `npm run dev`.
- **Aucune dépendance npm nouvelle.**
- **Pool de tirage** = `cardsByZone.mainboard` uniquement (commander exclu).
- **Taille de main** = 7 fixe au deal/mulligan ; `draw` = +1 sans limite artificielle (borné à `mainboard.length`).
- **Mélange** = Fisher-Yates, à la demande côté client (jamais au render initial → pas de hydration mismatch).
- **Deck édité** (mainboard change d'identité) → main réinitialisée (`shuffled = null`).
- **DA** : panneau de verre séparé, mêmes tokens que DeckStats (`--glass-bg`, `--glass-border`, `--glass-blur`, `border-radius: 2px`, titre uppercase `letter-spacing: 0.5px` `--brass`).
- **Clic carte** : `openCardModal(card, { readOnly: true })` via `useCardModalContext()`.
- Commit à la fin de chaque tâche. Trailer : `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Créés**

- `src/lib/deck/utils/sample-hand.ts` — fonction pure `shuffle(cards: Card[]): Card[]`.
- `src/app/decks/[id]/components/SampleHand/useSampleHand.ts` — hook d'état.
- `src/app/decks/[id]/components/SampleHand/SampleHand.tsx` (+ `.module.css`) — composant panneau.

**Modifiés**

- `src/app/decks/[id]/DeckDetailOwnerView.tsx` — monter `<SampleHand>` après `<DeckStats>`.
- `src/app/decks/[id]/DeckDetailReadOnlyView.tsx` — idem.

**Réutilisés (non modifiés, vérifiés)** : `CardList` (`cards` seul requis, `viewModes`, `onCardClick`, `pageSize`), `useCardModalContext().openCardModal(card, {readOnly})` (provider global), `Button` (`variant`/`size`/`disabled`/`onClick`), type `Card` (`@/types/cards`).

---

## Task 1: Fonction pure `shuffle`

**Files:**

- Create: `src/lib/deck/utils/sample-hand.ts`
- Verify (throwaway): `scratchpad/verify-shuffle.ts`

**Interfaces:**

- Consumes: type `Card` de `@/types/cards`.
- Produces: `shuffle(cards: Card[]): Card[]` — retourne une COPIE mélangée, ne mute pas l'entrée.

- [ ] **Step 1: Écrire l'implémentation**

Créer `src/lib/deck/utils/sample-hand.ts` :

```ts
import type { Card } from '@/types/cards';

/**
 * Fisher-Yates : retourne une nouvelle liste mélangée uniformément.
 * Ne mute pas le tableau d'entrée.
 */
export function shuffle(cards: Card[]): Card[] {
	const out = cards.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
```

- [ ] **Step 2: Vérifier avec un script jetable**

Créer `scratchpad/verify-shuffle.ts` :

```ts
import { shuffle } from '../src/lib/deck/utils/sample-hand';
import type { Card } from '../src/types/cards';

function card(id: string): Card {
	return { id } as Card;
}

function assert(label: string, cond: boolean) {
	console.log(cond ? `PASS ${label}` : `FAIL ${label}`);
	if (!cond) process.exitCode = 1;
}

const input = Array.from({ length: 20 }, (_, i) => card(String(i)));
const inputCopy = input.map((c) => c.id);
const out = shuffle(input);

// Ne mute pas l'entrée
assert('input non muté', input.map((c) => c.id).join(',') === inputCopy.join(','));
// Même longueur
assert('même longueur', out.length === input.length);
// Même multiset d'ids (permutation)
assert(
	'permutation (mêmes ids)',
	[...out.map((c) => c.id)].sort().join(',') === [...inputCopy].sort().join(',')
);
// Nouveau tableau (référence différente)
assert('nouvelle référence', out !== input);
// Cas vide
assert('vide', shuffle([]).length === 0);
// Cas 1 élément
assert(
	'singleton',
	shuffle([card('x')])
		.map((c) => c.id)
		.join('') === 'x'
);
```

- [ ] **Step 3: Exécuter — attendu : toutes lignes `PASS`**

Run: `npx tsx scratchpad/verify-shuffle.ts`
Expected: 6 lignes `PASS`, exit 0.

- [ ] **Step 4: Nettoyer + check**

Run:

```bash
rm scratchpad/verify-shuffle.ts
npm run check
```

Expected: `npm run check` passe (0 erreur).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck/utils/sample-hand.ts
git commit -m "feat(sample-hand): pure Fisher-Yates shuffle helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Hook `useSampleHand`

**Files:**

- Create: `src/app/decks/[id]/components/SampleHand/useSampleHand.ts`
- Verify (throwaway): `scratchpad/verify-sample-hand-logic.ts` (teste la logique de bornage pure ; voir Step 2)

**Interfaces:**

- Consumes (Task 1): `shuffle` de `@/lib/deck/utils/sample-hand` ; type `Card`.
- Produces: `useSampleHand(mainboard: Card[])` retournant :

  ```ts
  {
    hand: Card[];        // shuffled.slice(0, handSize) ou []
    hasHand: boolean;    // shuffled !== null
    canDraw: boolean;    // shuffled !== null && handSize < mainboard.length
    deal: () => void;    // mélange + handSize = min(7, len)
    mulligan: () => void;// = deal
    draw: () => void;    // handSize = min(handSize + 1, len)
  }
  ```

- [ ] **Step 1: Écrire le hook**

Créer `src/app/decks/[id]/components/SampleHand/useSampleHand.ts` :

```ts
import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@/types/cards';
import { shuffle } from '@/lib/deck/utils/sample-hand';

const INITIAL_HAND_SIZE = 7;

export interface SampleHandState {
	hand: Card[];
	hasHand: boolean;
	canDraw: boolean;
	deal: () => void;
	mulligan: () => void;
	draw: () => void;
}

export function useSampleHand(mainboard: Card[]): SampleHandState {
	const [shuffled, setShuffled] = useState<Card[] | null>(null);
	const [handSize, setHandSize] = useState(INITIAL_HAND_SIZE);

	// Deck édité (mainboard change d'identité) → réinitialiser la main.
	useEffect(() => {
		setShuffled(null);
		setHandSize(INITIAL_HAND_SIZE);
	}, [mainboard]);

	const deal = useCallback(() => {
		setShuffled(shuffle(mainboard));
		setHandSize(Math.min(INITIAL_HAND_SIZE, mainboard.length));
	}, [mainboard]);

	const draw = useCallback(() => {
		setHandSize((n) => Math.min(n + 1, mainboard.length));
	}, [mainboard.length]);

	const hasHand = shuffled !== null;
	const hand = shuffled ? shuffled.slice(0, handSize) : [];
	const canDraw = shuffled !== null && handSize < mainboard.length;

	return { hand, hasHand, canDraw, deal, mulligan: deal, draw };
}
```

- [ ] **Step 2: Vérifier la logique de bornage avec un script jetable**

Le hook lui-même a besoin de React ; on vérifie plutôt la logique pure de bornage (deal/draw) qui le sous-tend, pour attraper les erreurs off-by-one. Créer `scratchpad/verify-sample-hand-logic.ts` :

```ts
// Reproduit la logique de bornage du hook (deal/draw) sans React.
function dealSize(len: number) {
	return Math.min(7, len);
}
function drawSize(current: number, len: number) {
	return Math.min(current + 1, len);
}
function canDraw(handSize: number, len: number, hasHand: boolean) {
	return hasHand && handSize < len;
}

function assert(label: string, cond: boolean) {
	console.log(cond ? `PASS ${label}` : `FAIL ${label}`);
	if (!cond) process.exitCode = 1;
}

assert('deal 99 -> 7', dealSize(99) === 7);
assert('deal 5 -> 5 (petit deck)', dealSize(5) === 5);
assert('deal 0 -> 0', dealSize(0) === 0);
assert('draw 7 -> 8 (deck 99)', drawSize(7, 99) === 8);
assert('draw borné au deck (7/7)', drawSize(7, 7) === 7);
assert('canDraw vrai 7<99', canDraw(7, 99, true) === true);
assert('canDraw faux quand épuisé 99/99', canDraw(99, 99, true) === false);
assert('canDraw faux sans main', canDraw(7, 99, false) === false);
assert('canDraw faux petit deck 5/5', canDraw(5, 5, true) === false);
```

- [ ] **Step 3: Exécuter — attendu : toutes lignes `PASS`**

Run: `npx tsx scratchpad/verify-sample-hand-logic.ts`
Expected: 9 lignes `PASS`, exit 0.

- [ ] **Step 4: Nettoyer + check**

Run:

```bash
rm scratchpad/verify-sample-hand-logic.ts
npm run check
```

Expected: `npm run check` passe.

- [ ] **Step 5: Commit**

```bash
git add src/app/decks/\[id\]/components/SampleHand/useSampleHand.ts
git commit -m "feat(sample-hand): useSampleHand hook (deal/mulligan/draw + bounds)

Resets hand when mainboard identity changes. draw bounded to library size.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Composant `SampleHand`

**Files:**

- Create: `src/app/decks/[id]/components/SampleHand/SampleHand.tsx`
- Create: `src/app/decks/[id]/components/SampleHand/SampleHand.module.css`

**Interfaces:**

- Consumes (Task 2): `useSampleHand` de `./useSampleHand`.
- Consumes (existants): `CardList` (`@/lib/card/components/CardList/CardList`), `AnyCard` (`@/lib/card/components/CardList/CardList.types`), `useCardModalContext` (`@/contexts/CardModalProvider`), `Button` (`@/components/Button/Button`), type `Card`.
- Produces: `export function SampleHand(props: { mainboard: Card[] }): JSX.Element | null`.

- [ ] **Step 1: Écrire le composant**

Créer `src/app/decks/[id]/components/SampleHand/SampleHand.tsx` :

```tsx
'use client';

import type { Card } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { Button } from '@/components/Button/Button';
import { useSampleHand } from './useSampleHand';
import styles from './SampleHand.module.css';

type Props = {
	mainboard: Card[];
};

export function SampleHand({ mainboard }: Props) {
	const { openCardModal } = useCardModalContext();
	const { hand, hasHand, canDraw, deal, mulligan, draw } = useSampleHand(mainboard);

	if (mainboard.length === 0) return null;

	return (
		<div className={styles.panel}>
			<h3 className={styles.title}>Main de test</h3>

			{!hasHand ? (
				<div className={styles.emptyState}>
					<Button variant="primary" onClick={deal}>
						Tirer une main
					</Button>
				</div>
			) : (
				<>
					<CardList
						cards={hand}
						viewModes={['fluid-grid']}
						pageSize={false}
						onCardClick={(c: AnyCard) => openCardModal([c as Card], { readOnly: true })}
					/>
					<div className={styles.actions}>
						<Button variant="secondary" onClick={mulligan}>
							Mulligan
						</Button>
						<Button variant="secondary" onClick={draw} disabled={!canDraw}>
							Piocher
						</Button>
						<span className={styles.counter}>
							{hand.length} cartes · bibliothèque : {mainboard.length}
						</span>
					</div>
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Écrire le CSS**

Créer `src/app/decks/[id]/components/SampleHand/SampleHand.module.css` :

```css
.panel {
	margin-top: 16px;
	padding: 20px 24px;
	background: var(--glass-bg);
	border: 1px solid var(--glass-border);
	border-radius: 2px;
	backdrop-filter: blur(var(--glass-blur));
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.title {
	font-size: var(--text-base);
	font-weight: 600;
	color: var(--brass);
	margin: 0;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.emptyState {
	display: flex;
	justify-content: center;
	padding: 8px 0;
}

.actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.counter {
	font-size: var(--text-sm);
	color: var(--text-muted);
}

@media (max-width: 768px) {
	.panel {
		padding: 16px;
	}
}
```

- [ ] **Step 3: Vérifier le typage/lint**

Run: `npm run check`
Expected: passe. (Le composant n'est pas encore monté ; on valide compilation + lint.)

Note sur l'appel modal (déjà résolu dans le code ci-dessus) : `openCardModal` a la signature `(input: ScryfallCard | CustomCard | Card[], opts?: { readOnly?: boolean })`. Pour `readOnly`, un tableau `[card]` déclenche la branche « frozen stack » attendue — c'est pourquoi on passe `openCardModal([c as Card], { readOnly: true })` et NON `openCardModal(c, …)`. Ne pas « simplifier » en retirant le tableau.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/\[id\]/components/SampleHand/SampleHand.tsx src/app/decks/\[id\]/components/SampleHand/SampleHand.module.css
git commit -m "feat(sample-hand): SampleHand panel (CardList + Mulligan/Draw)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Monter `SampleHand` dans les deux vues détail

**Files:**

- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx` (après `<DeckStats stats={stats} warnings={warnings} />`, ~ligne 627)
- Modify: `src/app/decks/[id]/DeckDetailReadOnlyView.tsx` (après `<DeckStats stats={stats} warnings={warnings} />`, ~ligne 195)

**Interfaces:**

- Consumes (Task 3): `SampleHand` de `./components/SampleHand/SampleHand`.
- Consumes (existants dans les deux vues): `cardsByZone` (déstructuré du hook de détail ; `cardsByZone.mainboard: Card[]`).

- [ ] **Step 1: Importer et monter dans `DeckDetailOwnerView.tsx`**

Ajouter l'import près des autres imports de composants locaux (à côté de la ligne `import { DeckStats } from './components/DeckStats/DeckStats';`) :

```tsx
import { SampleHand } from './components/SampleHand/SampleHand';
```

Puis, juste après la ligne `<DeckStats stats={stats} warnings={warnings} />` :

```tsx
<SampleHand mainboard={cardsByZone.mainboard} />
```

- [ ] **Step 2: Importer et monter dans `DeckDetailReadOnlyView.tsx`**

Ajouter l'import près de `import { DeckStats } from './components/DeckStats/DeckStats';` :

```tsx
import { SampleHand } from './components/SampleHand/SampleHand';
```

Puis, juste après la ligne `<DeckStats stats={stats} warnings={warnings} />` :

```tsx
<SampleHand mainboard={cardsByZone.mainboard} />
```

- [ ] **Step 3: Vérifier le typage/lint + build**

Run:

```bash
npm run check
npm run build
```

Expected: `npm run check` 0 erreur ; `npm run build` compile le route `/decks/[id]` sans erreur.

- [ ] **Step 4: Vérification runtime**

Run: `npm run dev`

Ouvrir `/decks/[id]` sur son propre deck (owner) :

- La section « Main de test » apparaît sous DeckStats.
- « Tirer une main » affiche 7 cartes en fluid-grid.
- « Mulligan » retire une nouvelle main (composition différente).
- « Piocher » ajoute une 8e, 9e… carte ; se désactive quand toute la bibliothèque est piochée.
- Clic sur une carte → CardModal s'ouvre (readOnly).
- Sur un deck au mainboard vide → section absente.

Puis ouvrir un **deck public d'un autre utilisateur** (vue read-only) et re-tester tirer / mulligan / draw / clic modal.

- [ ] **Step 5: Commit**

```bash
git add src/app/decks/\[id\]/DeckDetailOwnerView.tsx src/app/decks/\[id\]/DeckDetailReadOnlyView.tsx
git commit -m "feat(sample-hand): mount SampleHand in owner + read-only deck views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage :**

- 7 cartes + Mulligan + Draw sans limite → Task 2 (hook bornage) + Task 3 (boutons). ✓
- Mainboard seul (commander exclu) → `mainboard={cardsByZone.mainboard}` (Task 4). ✓
- Rendu via CardList liste plate, fluid-grid, pas de table/sections → Task 3. ✓
- Clic → openCardModal readOnly → Task 3. ✓
- Mélange Fisher-Yates client-side à la demande → Task 1 (`shuffle`) + Task 2 (`deal` dans callback, pas au render). ✓
- Owner + read-only → Task 4 (deux montages). ✓
- Mainboard vide → section masquée → Task 3 (`return null`). ✓
- Deck édité → réinit → Task 2 (`useEffect` sur `mainboard`). ✓
- DA verre/or → Task 3 CSS. ✓

**Type consistency :** `shuffle(cards: Card[]): Card[]` (Task 1) consommé par `useSampleHand` (Task 2) ; `useSampleHand` retourne `{hand, hasHand, canDraw, deal, mulligan, draw}` consommés à l'identique en Task 3 ; `SampleHand({ mainboard })` monté avec `cardsByZone.mainboard` en Task 4. ✓

**Placeholders :** aucun TODO/TBD ; tout le code fourni ; vérifications = scripts tsx concrets supprimés avant commit + build + runtime. Aucune branche conditionnelle laissée à l'implémenteur.

**Signature `openCardModal` (résolue) :** vérifiée dans `CardModalProvider.tsx` = `(input: ScryfallCard | CustomCard | Card[], opts?: { readOnly?: boolean })`. Avec `readOnly`, un tableau `[card]` emprunte la branche « frozen stack » (jamais re-résolue contre les contextes du user connecté) — exactement le comportement voulu pour une main de test. Le plan fige donc `openCardModal([c as Card], { readOnly: true })`.
