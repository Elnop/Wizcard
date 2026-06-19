# Badges « dans le deck » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur chaque carte du panel de recherche du deck, si elle est déjà dans le deck, une pastille par zone montrant la zone abrégée et le nombre de copies.

**Architecture:** Un hook `useDeckCardIndex(deckId)` résout les `scryfallId` des copies du deck (`activeDeckCards`) en `oracle_id` via le cache Scryfall, puis construit une `Map<oracleId, Map<DeckZone, number>>`. Un composant de présentation `DeckZoneBadges` rend les pastilles. `CardSearchPanel` câble les deux dans son overlay existant. Le matching est par `oracle_id` (n'importe quelle édition).

**Tech Stack:** Next.js / React (client components), Zustand (deck-store via DeckContext), TypeScript, CSS modules. Pas de framework de test : les tests sont des scripts `tsx` standalone qui impriment PASS/FAIL et `process.exit(1)` en cas d'échec (cf. `src/lib/mpc/parse-filename.test.ts`).

---

## File Structure

- **Create** `src/app/decks/[id]/components/CardSearchPanel/deck-card-index.ts`
  Logique pure : `buildDeckCardIndex(copies)` → `Map<oracleId, Map<DeckZone, number>>`. Testable sans React.
- **Create** `src/app/decks/[id]/components/CardSearchPanel/deck-card-index.test.ts`
  Test `tsx` standalone du builder.
- **Create** `src/app/decks/[id]/components/CardSearchPanel/useDeckCardIndex.ts`
  Hook React : lit `activeDeckCards`, résout les oracle_id, expose `getDeckZones`.
- **Create** `src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.tsx`
  Composant de présentation pur (pastilles).
- **Create** `src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.module.css`
  Styles des pastilles.
- **Create** `src/app/decks/[id]/components/CardSearchPanel/zone-badge.ts`
  Helper pur : abréviation + ordre des zones. Partagé par `DeckZoneBadges`.
- **Create** `src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts`
  Test `tsx` standalone du helper.
- **Modify** `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`
  Câblage du hook + des badges dans `renderSearchOverlay`.
- **Modify** `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.module.css`
  Conteneur de badges en coin (positionnement, `pointer-events: none`).

---

## Task 1: Builder d'index pur

**Files:**

- Create: `src/app/decks/[id]/components/CardSearchPanel/deck-card-index.ts`
- Test: `src/app/decks/[id]/components/CardSearchPanel/deck-card-index.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/app/decks/[id]/components/CardSearchPanel/deck-card-index.test.ts` :

```ts
import { buildDeckCardIndex, type DeckCopyForIndex } from './deck-card-index';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
	if (cond) {
		console.log(`PASS: ${name}`);
		passed++;
	} else {
		console.error(`FAIL: ${name} ${detail}`);
		failed++;
	}
}

const copies: DeckCopyForIndex[] = [
	// 2x mainboard + 1x sideboard for oracle "bolt"
	{ oracleId: 'bolt', tags: ['deck:mainboard'] },
	{ oracleId: 'bolt', tags: ['deck:mainboard'] },
	{ oracleId: 'bolt', tags: ['deck:sideboard'] },
	// 1x mainboard for oracle "swamp" (no zone tag -> defaults to mainboard)
	{ oracleId: 'swamp', tags: undefined },
	// a token
	{ oracleId: 'goblin', tags: ['deck:tokens'] },
	// copy without oracleId is ignored
	{ oracleId: undefined, tags: ['deck:mainboard'] },
];

const index = buildDeckCardIndex(copies);

const bolt = index.get('bolt');
check('bolt present', bolt != null);
check('bolt mainboard 2', bolt?.get('mainboard') === 2, `got ${bolt?.get('mainboard')}`);
check('bolt sideboard 1', bolt?.get('sideboard') === 1, `got ${bolt?.get('sideboard')}`);
check('bolt no maybeboard', bolt?.get('maybeboard') === undefined);

const swamp = index.get('swamp');
check(
	'swamp mainboard 1 (untagged default)',
	swamp?.get('mainboard') === 1,
	`got ${swamp?.get('mainboard')}`
);

const goblin = index.get('goblin');
check('goblin tokens 1', goblin?.get('tokens') === 1, `got ${goblin?.get('tokens')}`);

check(
	'undefined oracleId ignored',
	!index.has(undefined as unknown as string) && index.size === 3,
	`size ${index.size}`
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx "src/app/decks/[id]/components/CardSearchPanel/deck-card-index.test.ts"`
Expected: FAIL — module/function not found (`Cannot find module './deck-card-index'`).

- [ ] **Step 3: Write minimal implementation**

Créer `src/app/decks/[id]/components/CardSearchPanel/deck-card-index.ts` :

```ts
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';

/** A deck copy reduced to what the index needs. */
export type DeckCopyForIndex = {
	oracleId: string | undefined;
	tags: string[] | undefined;
};

/** oracle_id → (zone → number of copies in that zone). */
export type DeckCardIndex = Map<string, Map<DeckZone, number>>;

/**
 * Build a per-oracle, per-zone copy count from deck copies. Copies without an
 * oracleId are ignored. Zone is derived from tags via getDeckZone (untagged
 * copies default to 'mainboard').
 */
export function buildDeckCardIndex(copies: DeckCopyForIndex[]): DeckCardIndex {
	const index: DeckCardIndex = new Map();
	for (const copy of copies) {
		if (!copy.oracleId) continue;
		const zone = getDeckZone(copy.tags);
		let byZone = index.get(copy.oracleId);
		if (!byZone) {
			byZone = new Map();
			index.set(copy.oracleId, byZone);
		}
		byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
	}
	return index;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx "src/app/decks/[id]/components/CardSearchPanel/deck-card-index.test.ts"`
Expected: PASS — `7 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/decks/[id]/components/CardSearchPanel/deck-card-index.ts" "src/app/decks/[id]/components/CardSearchPanel/deck-card-index.test.ts"
git commit -m "feat(deck): add deck card index builder for search panel badges"
```

---

## Task 2: Helper d'abréviation et d'ordre des zones

**Files:**

- Create: `src/app/decks/[id]/components/CardSearchPanel/zone-badge.ts`
- Test: `src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts` :

```ts
import { ZONE_ABBREV, orderZones } from './zone-badge';
import type { DeckZone } from '@/types/decks';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
	if (cond) {
		console.log(`PASS: ${name}`);
		passed++;
	} else {
		console.error(`FAIL: ${name} ${detail}`);
		failed++;
	}
}

check('mainboard abbrev', ZONE_ABBREV.mainboard === 'Main');
check('sideboard abbrev', ZONE_ABBREV.sideboard === 'Side');
check('maybeboard abbrev', ZONE_ABBREV.maybeboard === 'Maybe');
check('commander abbrev', ZONE_ABBREV.commander === 'Cmd');
check('tokens abbrev', ZONE_ABBREV.tokens === 'Tok');

// orderZones returns zones in stable canonical order regardless of input order
const input = new Map<DeckZone, number>([
	['tokens', 1],
	['mainboard', 2],
	['sideboard', 1],
]);
const ordered = orderZones(input).map(([z]) => z);
check(
	'orderZones canonical order',
	JSON.stringify(ordered) === JSON.stringify(['mainboard', 'sideboard', 'tokens']),
	`got ${JSON.stringify(ordered)}`
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx "src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts"`
Expected: FAIL — `Cannot find module './zone-badge'`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/app/decks/[id]/components/CardSearchPanel/zone-badge.ts` :

```ts
import type { DeckZone } from '@/types/decks';

/** Short label shown on a zone badge. */
export const ZONE_ABBREV: Record<DeckZone, string> = {
	mainboard: 'Main',
	sideboard: 'Side',
	maybeboard: 'Maybe',
	commander: 'Cmd',
	tokens: 'Tok',
};

/** Canonical display order for zones. */
const ZONE_ORDER: DeckZone[] = ['mainboard', 'sideboard', 'maybeboard', 'commander', 'tokens'];

/**
 * Return [zone, count] entries from a zone→count map in canonical order,
 * skipping zones with no count.
 */
export function orderZones(byZone: Map<DeckZone, number>): Array<[DeckZone, number]> {
	const result: Array<[DeckZone, number]> = [];
	for (const zone of ZONE_ORDER) {
		const count = byZone.get(zone);
		if (count != null && count > 0) result.push([zone, count]);
	}
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx "src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts"`
Expected: PASS — `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/decks/[id]/components/CardSearchPanel/zone-badge.ts" "src/app/decks/[id]/components/CardSearchPanel/zone-badge.test.ts"
git commit -m "feat(deck): add zone badge abbreviation and ordering helper"
```

---

## Task 3: Composant de présentation DeckZoneBadges

**Files:**

- Create: `src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.tsx`
- Create: `src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.module.css`

Note : pas de framework de test DOM dans ce repo ; ce composant est vérifié par `npm run check` (tsc + eslint) et visuellement à la Task 5. Sa logique pure (ordre/abréviations) est déjà couverte par la Task 2.

- [ ] **Step 1: Write the CSS module**

Créer `src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.module.css` :

```css
.badges {
	position: absolute;
	top: 4px;
	right: 4px;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 3px;
	pointer-events: none;
	z-index: 2;
}

.badge {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 6px;
	border-radius: 8px;
	font-size: 10px;
	font-weight: 700;
	line-height: 1.4;
	color: #fff;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	white-space: nowrap;
}

.mainboard {
	background: var(--primary, #4f46e5);
}

.sideboard {
	background: #0e7490;
}

.maybeboard {
	background: #b45309;
}

.commander {
	background: #7c3aed;
}

.tokens {
	background: #4b5563;
}

.count {
	font-weight: 800;
}
```

- [ ] **Step 2: Write the component**

Créer `src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.tsx` :

```tsx
import type { DeckZone } from '@/types/decks';
import { ZONE_ABBREV, orderZones } from './zone-badge';
import styles from './DeckZoneBadges.module.css';

const ZONE_CLASS: Record<DeckZone, string> = {
	mainboard: styles.mainboard,
	sideboard: styles.sideboard,
	maybeboard: styles.maybeboard,
	commander: styles.commander,
	tokens: styles.tokens,
};

type Props = {
	zones: Map<DeckZone, number> | undefined;
};

/**
 * Corner badges showing, per zone, how many copies of this card are already in
 * the deck. Renders nothing when the card is not in the deck. The container is
 * pointer-events:none so it never blocks the overlay's click / context menu.
 */
export function DeckZoneBadges({ zones }: Props) {
	if (!zones) return null;
	const entries = orderZones(zones);
	if (entries.length === 0) return null;

	return (
		<div className={styles.badges}>
			{entries.map(([zone, count]) => (
				<span key={zone} className={`${styles.badge} ${ZONE_CLASS[zone]}`}>
					{ZONE_ABBREV[zone]} <span className={styles.count}>{count}</span>
				</span>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Type/lint check**

Run: `npm run check`
Expected: PASS (no new tsc/eslint/prettier errors). If prettier complains, run `npm run check:fix` then re-run `npm run check`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.tsx" "src/app/decks/[id]/components/CardSearchPanel/DeckZoneBadges.module.css"
git commit -m "feat(deck): add DeckZoneBadges presentational component"
```

---

## Task 4: Hook useDeckCardIndex

**Files:**

- Create: `src/app/decks/[id]/components/CardSearchPanel/useDeckCardIndex.ts`

Note : ce hook orchestre du state React + résolution réseau/cache ; pas de test unitaire (pas de runner DOM). Le builder pur qu'il utilise est testé en Task 1. Vérifié par `npm run check` et la vérification visuelle Task 5.

- [ ] **Step 1: Write the hook**

Créer `src/app/decks/[id]/components/CardSearchPanel/useDeckCardIndex.ts` :

```ts
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { buildDeckCardIndex, type DeckCardIndex, type DeckCopyForIndex } from './deck-card-index';

/**
 * Builds an oracle_id → (zone → count) index for the cards currently in
 * `deckId`, resolving each copy's scryfallId to its oracle_id via the Scryfall
 * cache. Exposes `getDeckZones(oracleId)` for the search panel to look up
 * whether a result card is already in the deck. Returns undefined for cards not
 * in the deck.
 */
export function useDeckCardIndex(deckId: string): {
	getDeckZones: (oracleId: string | undefined) => Map<DeckZone, number> | undefined;
} {
	const { activeDeckId, activeDeckCards } = useDeckContext();

	// scryfallId → oracle_id, accumulated as we resolve.
	const [oracleByScryfallId, setOracleByScryfallId] = useState<Record<string, string>>({});
	const resolvedIdsRef = useRef<Set<string>>(new Set());
	const generationRef = useRef(0);

	const copies = useMemo(
		() => (activeDeckId === deckId ? Object.values(activeDeckCards) : []),
		[activeDeckId, deckId, activeDeckCards]
	);

	// Resolve oracle_ids for any scryfallIds we haven't resolved yet.
	useEffect(() => {
		const uniqueIds = [...new Set(copies.map((c) => c.scryfallId))];
		const toResolve = uniqueIds.filter((id) => !resolvedIdsRef.current.has(id));
		if (toResolve.length === 0) return;

		const generation = ++generationRef.current;
		void (async () => {
			const resolvedMap = await resolveCardsByScryfallIds(toResolve, {
				isCancelled: () => generationRef.current !== generation,
			});
			if (generationRef.current !== generation) return;
			const additions: Record<string, string> = {};
			for (const [scryfallId, card] of resolvedMap) {
				resolvedIdsRef.current.add(scryfallId);
				if (card.oracle_id) additions[scryfallId] = card.oracle_id;
			}
			if (Object.keys(additions).length > 0) {
				setOracleByScryfallId((prev) => ({ ...prev, ...additions }));
			}
		})();
	}, [copies]);

	const index: DeckCardIndex = useMemo(() => {
		const forIndex: DeckCopyForIndex[] = copies.map((c) => ({
			oracleId: oracleByScryfallId[c.scryfallId],
			tags: c.entry.tags,
		}));
		return buildDeckCardIndex(forIndex);
	}, [copies, oracleByScryfallId]);

	return {
		getDeckZones: (oracleId) => (oracleId ? index.get(oracleId) : undefined),
	};
}
```

- [ ] **Step 2: Type/lint check**

Run: `npm run check`
Expected: PASS. If prettier complains, run `npm run check:fix` then re-run.

- [ ] **Step 3: Commit**

```bash
git add "src/app/decks/[id]/components/CardSearchPanel/useDeckCardIndex.ts"
git commit -m "feat(deck): add useDeckCardIndex hook resolving deck cards by oracle_id"
```

---

## Task 5: Câblage dans CardSearchPanel

**Files:**

- Modify: `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`
- Modify: `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.module.css`

- [ ] **Step 1: Add the relative-position class to the overlay CSS**

Dans `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.module.css`, la règle existante est :

```css
.searchCardOverlay {
	position: absolute;
	inset: 0;
	cursor: context-menu;
}
```

Les badges sont positionnés en absolu par rapport à la carte. L'overlay couvre déjà toute la carte (`inset: 0`) et sert d'ancre. Ajouter juste après cette règle un conteneur d'ancrage explicite n'est pas nécessaire : les badges seront rendus en frère de la `div` overlay, dans le même wrapper de carte positionné. Aucune modification CSS n'est requise ici si le wrapper de carte est déjà `position: relative`. Vérifier : ouvrir `src/lib/card/components/CardListGrid/` pour confirmer que l'item de grille est `position: relative`.

Run: `grep -rn "position: relative" src/lib/card/components/CardListGrid/`
Expected: au moins une règle `position: relative` sur le conteneur d'item (l'overlay `inset:0` actuel le prouve déjà). Si confirmé, aucune modification de ce fichier CSS n'est nécessaire — passer au Step 2.

- [ ] **Step 2: Import the hook and component in CardSearchPanel**

Dans `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`, ajouter aux imports locaux (près de la ligne `import { CardModeSwitcher } from './CardModeSwitcher';`) :

```tsx
import { DeckZoneBadges } from './DeckZoneBadges';
import { useDeckCardIndex } from './useDeckCardIndex';
```

- [ ] **Step 3: Instantiate the hook**

Dans le corps de `CardSearchPanel`, juste après `const { addCardToDeck } = useDeckContext();` (ligne ~71), ajouter :

```tsx
const { getDeckZones } = useDeckCardIndex(deckId);
```

- [ ] **Step 4: Render badges in the overlay**

Remplacer le `renderSearchOverlay` actuel :

```tsx
const renderSearchOverlay = useCallback(
	(card: AnyCard) => (
		<div
			className={styles.searchCardOverlay}
			onClick={(e) => e.stopPropagation()}
			onContextMenu={(e) => openContextMenu(card as ScryfallCard, e)}
		/>
	),
	[openContextMenu]
);
```

par :

```tsx
const renderSearchOverlay = useCallback(
	(card: AnyCard) => (
		<>
			<div
				className={styles.searchCardOverlay}
				onClick={(e) => e.stopPropagation()}
				onContextMenu={(e) => openContextMenu(card as ScryfallCard, e)}
			/>
			<DeckZoneBadges zones={getDeckZones(card.oracle_id)} />
		</>
	),
	[openContextMenu, getDeckZones]
);
```

- [ ] **Step 5: Type/lint check**

Run: `npm run check`
Expected: PASS. If prettier complains, run `npm run check:fix` then re-run.

Note : `card.oracle_id` est `string | undefined` sur `AnyCard` (présent en optionnel sur `ScryfallCard`, `Card`, `CustomCard`). `getDeckZones` accepte `string | undefined` — pas de cast nécessaire.

- [ ] **Step 6: Commit**

```bash
git add "src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx" "src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.module.css"
git commit -m "feat(deck): show in-deck zone badges on search panel cards"
```

---

## Task 6: Vérification visuelle de bout en bout

**Files:** aucun (vérification manuelle).

- [ ] **Step 1: Lancer l'app**

Run: `npm run dev`
Ouvrir un deck, ouvrir le panel « Add Cards ».

- [ ] **Step 2: Vérifier les cas**

1. Chercher une carte **déjà dans le mainboard** → pastille `Main N` en haut à droite.
2. Une carte présente en **mainboard + sideboard** → deux pastilles empilées (`Main x`, `Side y`).
3. Une carte **absente du deck** → aucune pastille.
4. **Édition différente** de la même carte (autre print) → pastille présente (matching par oracle_id).
5. Mode **token** : ajouter un token déjà présent → pastille `Tok N`.
6. Le **clic** sur la carte et le **clic droit** (menu contextuel) fonctionnent toujours (badges en `pointer-events: none`).
7. Ajouter une carte depuis le panel → la pastille apparaît/incrémente après ajout (réactivité de `activeDeckCards`).

- [ ] **Step 3: Final check**

Run: `npm run check`
Expected: PASS. Tous les commits des tâches précédentes sont en place.

---

## Self-Review

- **Spec coverage :** matching oracle_id (Task 1 + 4) ✓ ; badge en coin (Task 3 CSS) ✓ ; un badge par zone (Task 3 + 2) ✓ ; les deux modes du panel + tokens (Task 5 + 6) ✓ ; oracle_id absent → pas de badge (Task 1 ignore, Task 3 `null`) ✓ ; pas de throw / deck non chargé → index vide (Task 4 `resolveCardsByScryfallIds` ne throw pas, copies vides si `activeDeckId !== deckId`) ✓ ; tests builder + helper (Task 1, 2) ✓.
- **Placeholders :** aucun TODO/TBD ; tout le code est fourni.
- **Type consistency :** `buildDeckCardIndex`/`DeckCopyForIndex`/`DeckCardIndex` cohérents Task 1↔4 ; `getDeckZones(oracleId?)` cohérent Task 4↔5 ; `ZONE_ABBREV`/`orderZones` cohérents Task 2↔3 ; `DeckZoneBadges` prop `zones` cohérent Task 3↔5.
