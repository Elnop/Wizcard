# Deck Building Analytics Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir le panneau `DeckStats` de `/decks/[id]` avec colors cost, colors production, équilibre de manabase et répartition des types, dans la DA verre/or du site ; polir la `MiniManaCurve`.

**Architecture:** Étendre la fonction pure `computeDeckStats` avec de nouveaux champs (`colorsCost`, `colorsProduction`, `typeDistribution`) et des helpers purs isolés (`mana-cost.ts`). Recomposer `DeckStats.tsx` en flux vertical (KPIs → curve → ColorBalance → TypeBar) avec deux nouveaux composants CSS-only. Aucun champ existant n'est renommé (rétrocompat totale avec `DeckFooter`).

**Tech Stack:** Next.js (App Router), React client components, TypeScript strict, CSS Modules. Graphiques en CSS (flex + width %) — aucune librairie de charting. Données `ScryfallCard`.

## Global Constraints

- **Pas de framework de test** dans ce projet (pas de vitest/jest). Vérification = `npm run check` (TypeScript + ESLint + Prettier) + runtime `npm run dev` sur `/decks/[id]`. Les "tests" du plan sont des **harnais de vérification manuels** (scripts jetables `tsx` dans `scratchpad/`, supprimés avant commit) et des assertions décrites, pas des fichiers de test committés.
- **Aucune dépendance npm nouvelle.** Graphiques en CSS pur.
- **Ne pas renommer** `DeckStats.colorDistribution` — champs existants conservés à l'identique. On **ajoute** seulement de nouveaux champs.
- **Tokens DA** : réutiliser `--glass-bg`, `--glass-border`, `--gold`, `--brass`, `--text-muted`, `--mana-white|blue|black|red|green|colorless`. `border-radius: 2px` sur les panneaux. Titres uppercase `letter-spacing: 0.5px` en `--brass`.
- **Distributions** calculées sur `mainboard` + `commander` ; `maybeboard`/`sideboard` exclus des distributions (comportement actuel préservé).
- **Double-face** : chaque face = une entrée dans les distributions (curve/cost/types). `produced_mana` reste au niveau carte (absent de `ScryfallCardFace`). Le KPI "nb de cartes" reste physique.
- **Ton des insights** : neutre/informatif, jamais alarmant.
- Commit à la fin de chaque tâche. Message conventionnel (`feat(deck-stats): …`), terminé par la ligne `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Créés**

- `src/lib/deck/utils/mana-cost.ts` — helpers purs : `parseColorPips`, `iterateFaces`, `categorizeType` + types partagés (`ManaColor`, `ProdColor`, `TypeCategory`).
- `src/app/decks/[id]/components/ColorBalance/ColorBalance.tsx` + `.module.css` — barres Coût vs Production + notes.
- `src/app/decks/[id]/components/TypeBar/TypeBar.tsx` + `.module.css` — ruban de types + légende.

**Modifiés**

- `src/lib/deck/utils/deck-stats.ts` — nouveaux champs sur `DeckStats`, calculs par face.
- `src/app/decks/[id]/components/DeckStats/DeckStats.tsx` (+ `.module.css`) — flux vertical, KPIs, intègre ColorBalance + TypeBar.
- `src/app/decks/[id]/components/ManaCurve/ManaCurve.tsx` (+ `.module.css`) — tooltip au survol.
- `src/app/decks/components/DeckCard/MiniManaCurve.module.css` — polish (accent barre max).

**Non modifiés** (vérifiés compatibles) : `DeckFooter.tsx` (lit `colorDistribution`, conservé), les 3 hooks appelant `computeDeckStats`, `usePublicDeckDetail.ts`, `useDeckDetail.ts`, `useDeckSummaries.ts`.

---

## Task 1: Helpers purs de coût de mana (`mana-cost.ts`)

**Files:**

- Create: `src/lib/deck/utils/mana-cost.ts`
- Verify (throwaway): `scratchpad/verify-mana-cost.ts`

**Interfaces:**

- Consumes: `ScryfallCard`, `ScryfallCardFace` de `@/lib/scryfall/types/scryfall`.
- Produces:
  - `type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G'`
  - `type ProdColor = ManaColor | 'C'`
  - `type TypeCategory = 'Creature' | 'Instant' | 'Sorcery' | 'Enchantment' | 'Artifact' | 'Planeswalker' | 'Land' | 'Other'`
  - `type FaceLike = { mana_cost?: string; cmc?: number; type_line?: string }`
  - `parseColorPips(manaCost: string): Record<ManaColor, number>` — toujours les 5 clés, valeurs ≥ 0 (décimaux possibles).
  - `iterateFaces(card: ScryfallCard): FaceLike[]`
  - `categorizeType(typeLine: string): TypeCategory`

- [ ] **Step 1: Écrire l'implémentation**

Créer `src/lib/deck/utils/mana-cost.ts` :

```ts
import type { ScryfallCard, ScryfallCardFace } from '@/lib/scryfall/types/scryfall';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';
export type ProdColor = ManaColor | 'C';
export type TypeCategory =
	| 'Creature'
	| 'Instant'
	| 'Sorcery'
	| 'Enchantment'
	| 'Artifact'
	| 'Planeswalker'
	| 'Land'
	| 'Other';

export type FaceLike = {
	mana_cost?: string;
	cmc?: number;
	type_line?: string;
};

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

function emptyPips(): Record<ManaColor, number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0 };
}

/**
 * Compte les pips colorés d'un coût de mana Scryfall (ex: "{1}{G}{G}", "{G/U}", "{B/P}").
 * - Mono-couleur ({R})            → +1 pour la couleur
 * - Hybride couleur/couleur ({G/U}) → +0.5 pour chaque couleur
 * - Phyrexian ({G/P})            → +1 pour la couleur
 * - Générique ({2}, {X}), incolore ({C}), snow ({S}) → ignoré
 */
export function parseColorPips(manaCost: string): Record<ManaColor, number> {
	const pips = emptyPips();
	if (!manaCost) return pips;
	const symbols = manaCost.match(/\{[^}]+\}/g) ?? [];
	for (const raw of symbols) {
		const inner = raw.slice(1, -1).toUpperCase(); // "G/U", "B/P", "R", "2", "X"
		const parts = inner.split('/');
		const colorParts = parts.filter((p): p is ManaColor => (COLORS as string[]).includes(p));
		if (colorParts.length === 0) continue; // générique / incolore / X
		if (colorParts.length === 1) {
			// mono-couleur, ou Phyrexian (couleur + "P"), ou couleur + générique ({2/G})
			pips[colorParts[0]] += 1;
		} else {
			// hybride couleur/couleur → 0.5 chacun
			for (const c of colorParts) pips[c] += 0.5;
		}
	}
	return pips;
}

/** Normalise mono/double-face en une liste de faces exploitables (cost/curve/types). */
export function iterateFaces(card: ScryfallCard): FaceLike[] {
	if (card.card_faces && card.card_faces.length > 0) {
		return card.card_faces.map((f: ScryfallCardFace) => ({
			mana_cost: f.mana_cost,
			cmc: f.cmc ?? card.cmc,
			type_line: f.type_line,
		}));
	}
	return [{ mana_cost: card.mana_cost, cmc: card.cmc, type_line: card.type_line }];
}

/** Catégorie primaire d'une face selon son type_line (priorité MTG). */
export function categorizeType(typeLine: string): TypeCategory {
	const t = (typeLine ?? '').toLowerCase();
	if (t.includes('land')) return 'Land';
	if (t.includes('creature')) return 'Creature';
	if (t.includes('planeswalker')) return 'Planeswalker';
	if (t.includes('instant')) return 'Instant';
	if (t.includes('sorcery')) return 'Sorcery';
	if (t.includes('enchantment')) return 'Enchantment';
	if (t.includes('artifact')) return 'Artifact';
	return 'Other';
}
```

- [ ] **Step 2: Vérifier le comportement avec un script jetable**

Créer `scratchpad/verify-mana-cost.ts` :

```ts
import { parseColorPips, categorizeType } from '../src/lib/deck/utils/mana-cost';

function assert(label: string, got: unknown, want: unknown) {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	console.log(
		ok ? `PASS ${label}` : `FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`
	);
	if (!ok) process.exitCode = 1;
}

assert('mono {1}{G}{G}', parseColorPips('{1}{G}{G}'), { W: 0, U: 0, B: 0, R: 0, G: 2 });
assert('hybride {G/U}', parseColorPips('{G/U}'), { W: 0, U: 0.5, B: 0, R: 0, G: 0.5 });
assert('phyrexian {B/P}', parseColorPips('{B/P}'), { W: 0, U: 0, B: 1, R: 0, G: 0 });
assert('générique/X {X}{2}{C}', parseColorPips('{X}{2}{C}'), { W: 0, U: 0, B: 0, R: 0, G: 0 });
assert('vide', parseColorPips(''), { W: 0, U: 0, B: 0, R: 0, G: 0 });
assert('type artifact creature', categorizeType('Artifact Creature — Golem'), 'Creature');
assert('type land', categorizeType('Basic Land — Forest'), 'Land');
assert('type instant', categorizeType('Instant'), 'Instant');
```

- [ ] **Step 3: Exécuter le script — attendu : toutes les lignes `PASS`**

Run: `npx tsx scratchpad/verify-mana-cost.ts`
Expected: 7 lignes `PASS`, aucun `FAIL`, exit 0.

- [ ] **Step 4: Supprimer le script jetable et lancer `check`**

Run:

```bash
rm scratchpad/verify-mana-cost.ts
npm run check
```

Expected: `npm run check` passe (0 erreur TS/ESLint/Prettier).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck/utils/mana-cost.ts
git commit -m "feat(deck-stats): pure mana-cost helpers (pips, faces, types)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Étendre `computeDeckStats`

**Files:**

- Modify: `src/lib/deck/utils/deck-stats.ts`
- Verify (throwaway): `scratchpad/verify-deck-stats.ts`

**Interfaces:**

- Consumes (Task 1): `parseColorPips`, `iterateFaces`, `categorizeType`, `ManaColor`, `ProdColor`, `TypeCategory` de `./mana-cost`.
- Produces: interface `DeckStats` élargie (nouveaux champs), signature `computeDeckStats(cards)` inchangée.
  - Nouveaux champs : `colorsCost: Record<ManaColor, number>`, `colorsProduction: Record<ProdColor, number>`, `typeDistribution: Record<TypeCategory, number>`.
  - Champs existants **conservés à l'identique** : `colorDistribution: Record<string, number>`, etc.

- [ ] **Step 1: Réécrire `deck-stats.ts`**

Remplacer le contenu de `src/lib/deck/utils/deck-stats.ts` par :

```ts
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import {
	parseColorPips,
	iterateFaces,
	categorizeType,
	type ManaColor,
	type ProdColor,
	type TypeCategory,
} from './mana-cost';

export interface DeckStats {
	totalCards: number;
	mainboardCount: number;
	sideboardCount: number;
	maybeboardCount: number;
	commanderCount: number;
	landCount: number;
	averageCmc: number;
	manaCurve: Record<number, number>;
	colorDistribution: Record<string, number>; // color identity — inchangé
	colorsCost: Record<ManaColor, number>; // pips requis (hybride 0.5)
	colorsProduction: Record<ProdColor, number>; // sources de mana (produced_mana)
	typeDistribution: Record<TypeCategory, number>;
}

const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

function emptyCost(): Record<ManaColor, number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0 };
}
function emptyProduction(): Record<ProdColor, number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}
function emptyTypes(): Record<TypeCategory, number> {
	return {
		Creature: 0,
		Instant: 0,
		Sorcery: 0,
		Enchantment: 0,
		Artifact: 0,
		Planeswalker: 0,
		Land: 0,
		Other: 0,
	};
}

export function computeDeckStats(cards: Array<{ card: ScryfallCard; zone: DeckZone }>): DeckStats {
	const mainboard = cards.filter((c) => c.zone === 'mainboard');
	const sideboard = cards.filter((c) => c.zone === 'sideboard');
	const maybeboard = cards.filter((c) => c.zone === 'maybeboard');
	const commander = cards.filter((c) => c.zone === 'commander');

	const manaCurve: Record<number, number> = {};
	const colorsCost = emptyCost();
	const colorsProduction = emptyProduction();
	const typeDistribution = emptyTypes();
	let cmcSum = 0;
	let cmcCount = 0;
	let landCount = 0;

	// Distributions par face : mainboard + commander, hors maybeboard/sideboard
	for (const { card } of [...mainboard, ...commander]) {
		// Production : au niveau carte (produced_mana absent des faces)
		for (const color of card.produced_mana ?? []) {
			if (color in colorsProduction) {
				colorsProduction[color as ProdColor] += 1;
			}
		}

		for (const face of iterateFaces(card)) {
			const category = categorizeType(face.type_line ?? '');
			typeDistribution[category] += 1;

			if (category === 'Land') {
				landCount++;
				continue; // exclu de la curve, du cmc moyen et des pips
			}

			const cmc = Math.floor(face.cmc ?? 0);
			manaCurve[cmc] = (manaCurve[cmc] ?? 0) + 1;
			cmcSum += cmc;
			cmcCount++;

			const pips = parseColorPips(face.mana_cost ?? '');
			for (const c of MANA_COLORS) colorsCost[c] += pips[c];
		}
	}

	// Color identity (inchangé) : toutes zones sauf maybeboard
	const colorDistribution: Record<string, number> = {};
	for (const { card, zone } of cards) {
		if (zone === 'maybeboard') continue;
		for (const color of card.color_identity ?? []) {
			colorDistribution[color] = (colorDistribution[color] ?? 0) + 1;
		}
	}

	return {
		totalCards: mainboard.length + sideboard.length + commander.length,
		mainboardCount: mainboard.length,
		sideboardCount: sideboard.length,
		maybeboardCount: maybeboard.length,
		commanderCount: commander.length,
		landCount,
		averageCmc: cmcCount > 0 ? cmcSum / cmcCount : 0,
		manaCurve,
		colorDistribution,
		colorsCost,
		colorsProduction,
		typeDistribution,
	};
}
```

- [ ] **Step 2: Vérifier avec un script jetable**

Créer `scratchpad/verify-deck-stats.ts` :

```ts
import { computeDeckStats } from '../src/lib/deck/utils/deck-stats';
import type { ScryfallCard } from '../src/lib/scryfall/types/scryfall';

function card(partial: Partial<ScryfallCard>): ScryfallCard {
	return {
		type_line: '',
		cmc: 0,
		color_identity: [],
		...partial,
	} as ScryfallCard;
}

const cards = [
	{
		card: card({ type_line: 'Creature — Elf', cmc: 2, mana_cost: '{G}{G}', color_identity: ['G'] }),
		zone: 'mainboard' as const,
	},
	{
		card: card({ type_line: 'Instant', cmc: 1, mana_cost: '{U}', color_identity: ['U'] }),
		zone: 'mainboard' as const,
	},
	{
		card: card({ type_line: 'Land', mana_cost: '', produced_mana: ['G'], color_identity: [] }),
		zone: 'mainboard' as const,
	},
	{
		card: card({
			type_line: 'Artifact',
			cmc: 2,
			mana_cost: '{2}',
			produced_mana: ['W', 'U', 'B', 'R', 'G'],
			color_identity: [],
		}),
		zone: 'mainboard' as const,
	},
	// Double-face : 2 faces distinctes dans les distributions
	{
		card: card({
			type_line: 'Creature // Land',
			cmc: 3,
			mana_cost: '{2}{R}',
			color_identity: ['R'],
			card_faces: [
				{
					object: 'card_face',
					name: 'Front',
					mana_cost: '{2}{R}',
					type_line: 'Creature — Beast',
					cmc: 3,
				},
				{ object: 'card_face', name: 'Back', mana_cost: '', type_line: 'Land', cmc: 0 },
			] as ScryfallCard['card_faces'],
		}),
		zone: 'mainboard' as const,
	},
];

const s = computeDeckStats(cards);
function assert(label: string, got: unknown, want: unknown) {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	console.log(
		ok ? `PASS ${label}` : `FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`
	);
	if (!ok) process.exitCode = 1;
}

// totalCards = exemplaires physiques (5), pas les faces
assert('totalCards physiques', s.totalCards, 5);
// lands = 1 terrain simple + 1 face arrière = 2
assert('landCount (faces)', s.landCount, 2);
// pips : G+G (2), U (1), R (1) — face terrain arrière ignorée
assert('colorsCost.G', s.colorsCost.G, 2);
assert('colorsCost.U', s.colorsCost.U, 1);
assert('colorsCost.R', s.colorsCost.R, 1);
// production : terrain G (1) + rock 5 couleurs
assert('colorsProduction.G', s.colorsProduction.G, 2);
assert('colorsProduction.W', s.colorsProduction.W, 1);
// types : 2 Creature (elf + front beast), 1 Instant, 1 Artifact, 2 Land
assert('types.Creature', s.typeDistribution.Creature, 2);
assert('types.Land', s.typeDistribution.Land, 2);
```

- [ ] **Step 3: Exécuter — attendu : toutes lignes `PASS`**

Run: `npx tsx scratchpad/verify-deck-stats.ts`
Expected: toutes les lignes `PASS`, exit 0. (Confirme : totaux physiques, faces dans distributions, hybride/pips, production au niveau carte.)

- [ ] **Step 4: Nettoyer + check**

Run:

```bash
rm scratchpad/verify-deck-stats.ts
npm run check
```

Expected: `npm run check` passe. (Les 3 hooks consommateurs compilent : ils n'utilisent que des champs conservés.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck/utils/deck-stats.ts
git commit -m "feat(deck-stats): colors cost/production + type distribution

Per-face distributions; production at card level; physical totals unchanged.
colorDistribution kept as-is for DeckFooter compat.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Composant `ColorBalance`

**Files:**

- Create: `src/app/decks/[id]/components/ColorBalance/ColorBalance.tsx`
- Create: `src/app/decks/[id]/components/ColorBalance/ColorBalance.module.css`

**Interfaces:**

- Consumes (Task 2): `DeckStats['colorsCost']` (`Record<ManaColor, number>`), `DeckStats['colorsProduction']` (`Record<ProdColor, number>`) via props.
- Produces: `export function ColorBalance(props: { cost: Record<string, number>; production: Record<string, number> }): JSX.Element`

- [ ] **Step 1: Écrire le composant**

Créer `src/app/decks/[id]/components/ColorBalance/ColorBalance.tsx` :

```tsx
'use client';

import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import styles from './ColorBalance.module.css';

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
const COLOR_CSS: Record<string, string> = {
	W: 'var(--mana-white)',
	U: 'var(--mana-blue)',
	B: 'var(--mana-black)',
	R: 'var(--mana-red)',
	G: 'var(--mana-green)',
	C: 'var(--mana-colorless)',
};
const COLOR_LABELS: Record<string, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green',
};

// Écart (points de %) au-delà duquel on affiche une note informative.
const NOTE_THRESHOLD = 12;

type Props = {
	cost: Record<string, number>;
	production: Record<string, number>;
};

function pct(map: Record<string, number>, keys: readonly string[]) {
	const total = keys.reduce((s, k) => s + (map[k] ?? 0), 0) || 1;
	return (k: string) => ((map[k] ?? 0) / total) * 100;
}

function StackedBar({
	label,
	values,
	keys,
}: {
	label: string;
	values: (k: string) => number;
	keys: readonly string[];
}) {
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>{label}</span>
			<div className={styles.bar}>
				{keys.map((k) => {
					const w = values(k);
					if (w <= 0) return null;
					return (
						<span
							key={k}
							className={styles.segment}
							style={{ width: `${w}%`, background: COLOR_CSS[k] }}
							title={`${COLOR_LABELS[k] ?? k}: ${Math.round(w)}%`}
						/>
					);
				})}
			</div>
		</div>
	);
}

export function ColorBalance({ cost, production }: Props) {
	const costPct = pct(cost, COLOR_ORDER);
	// Production comparée sur les mêmes 5 couleurs (C exclu de la comparaison pips).
	const prodPct = pct(production, COLOR_ORDER);

	const hasCost = COLOR_ORDER.some((k) => (cost[k] ?? 0) > 0);
	const hasProd = COLOR_ORDER.some((k) => (production[k] ?? 0) > 0);
	if (!hasCost && !hasProd) return null;

	const notes = COLOR_ORDER.filter((k) => (cost[k] ?? 0) > 0 || (production[k] ?? 0) > 0)
		.map((k) => ({ k, gap: Math.round(costPct(k) - prodPct(k)) }))
		.filter((n) => Math.abs(n.gap) >= NOTE_THRESHOLD);

	return (
		<div className={styles.container}>
			<StackedBar label="Cost" values={costPct} keys={COLOR_ORDER} />
			<StackedBar label="Production" values={prodPct} keys={COLOR_ORDER} />
			{notes.length > 0 && (
				<ul className={styles.notes}>
					{notes.map(({ k, gap }) => (
						<li key={k} className={styles.note}>
							<ColorIdentityIcons colors={[k]} size={14} />
							{COLOR_LABELS[k] ?? k} : {Math.round(costPct(k))}% des pips, {Math.round(prodPct(k))}%
							des sources
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Écrire le CSS**

Créer `src/app/decks/[id]/components/ColorBalance/ColorBalance.module.css` :

```css
.container {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.row {
	display: flex;
	align-items: center;
	gap: 10px;
}

.rowLabel {
	width: 72px;
	flex-shrink: 0;
	font-size: var(--text-xs);
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: var(--text-muted);
}

.bar {
	flex: 1;
	display: flex;
	height: 12px;
	border-radius: 2px;
	overflow: hidden;
	background: var(--surface);
}

.segment {
	display: block;
	transition: width 0.3s ease;
}

.notes {
	list-style: none;
	margin: 4px 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.note {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: var(--text-xs);
	color: var(--gold);
}
```

- [ ] **Step 3: Vérifier le typage/lint**

Run: `npm run check`
Expected: passe. (Le composant n'est pas encore monté ; on valide compilation + lint.)

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/[id]/components/ColorBalance/
git commit -m "feat(deck-stats): ColorBalance component (cost vs production)

Aligned stacked bars + neutral per-color notes above threshold.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Composant `TypeBar`

**Files:**

- Create: `src/app/decks/[id]/components/TypeBar/TypeBar.tsx`
- Create: `src/app/decks/[id]/components/TypeBar/TypeBar.module.css`

**Interfaces:**

- Consumes (Task 2): `DeckStats['typeDistribution']` via prop `types`.
- Produces: `export function TypeBar(props: { types: Record<string, number> }): JSX.Element | null`

- [ ] **Step 1: Écrire le composant**

Créer `src/app/decks/[id]/components/TypeBar/TypeBar.tsx` :

```tsx
'use client';

import styles from './TypeBar.module.css';

// Ordre d'affichage + couleur de segment (teintes DA, distinctes des couleurs mana).
const TYPE_ORDER: Array<{ key: string; label: string; css: string }> = [
	{ key: 'Creature', label: 'Creatures', css: 'var(--brass)' },
	{ key: 'Instant', label: 'Instants', css: '#5a6b8a' },
	{ key: 'Sorcery', label: 'Sorceries', css: '#6b7a9a' },
	{ key: 'Enchantment', label: 'Enchantments', css: '#8a6b9a' },
	{ key: 'Artifact', label: 'Artifacts', css: '#9a8a6b' },
	{ key: 'Planeswalker', label: 'Planeswalkers', css: '#8a5a6b' },
	{ key: 'Land', label: 'Lands', css: 'var(--surface-hover)' },
	{ key: 'Other', label: 'Other', css: 'var(--border)' },
];

type Props = {
	types: Record<string, number>;
};

export function TypeBar({ types }: Props) {
	const entries = TYPE_ORDER.map((t) => ({ ...t, count: types[t.key] ?? 0 })).filter(
		(t) => t.count > 0
	);
	const total = entries.reduce((s, t) => s + t.count, 0);
	if (total === 0) return null;

	return (
		<div className={styles.container}>
			<div className={styles.bar}>
				{entries.map((t) => (
					<span
						key={t.key}
						className={styles.segment}
						style={{ width: `${(t.count / total) * 100}%`, background: t.css }}
						title={`${t.label}: ${t.count}`}
					/>
				))}
			</div>
			<ul className={styles.legend}>
				{entries.map((t) => (
					<li key={t.key} className={styles.item}>
						<span className={styles.dot} style={{ background: t.css }} />
						{t.label} ({t.count})
					</li>
				))}
			</ul>
		</div>
	);
}
```

- [ ] **Step 2: Écrire le CSS**

Créer `src/app/decks/[id]/components/TypeBar/TypeBar.module.css` :

```css
.container {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.bar {
	display: flex;
	height: 12px;
	border-radius: 2px;
	overflow: hidden;
	background: var(--surface);
}

.segment {
	display: block;
	transition: width 0.3s ease;
}

.legend {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.item {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: var(--text-sm);
	color: var(--text-muted);
}

.dot {
	width: 10px;
	height: 10px;
	border-radius: 2px;
	flex-shrink: 0;
}
```

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: passe.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/[id]/components/TypeBar/
git commit -m "feat(deck-stats): TypeBar component (type distribution ribbon)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Tooltip sur `ManaCurve`

**Files:**

- Modify: `src/app/decks/[id]/components/ManaCurve/ManaCurve.tsx`
- Modify: `src/app/decks/[id]/components/ManaCurve/ManaCurve.module.css`

**Interfaces:**

- Consumes: inchangé (`curve: Record<number, number>`).
- Produces: inchangé (mêmes props, ajout d'un `title` natif sur chaque colonne).

- [ ] **Step 1: Ajouter le `title` au survol**

Dans `src/app/decks/[id]/components/ManaCurve/ManaCurve.tsx`, sur le `<div className={styles.column}>` (autour de la ligne 28), ajouter un attribut `title` :

```tsx
<div
	key={entry.cmc}
	className={styles.column}
	title={`CMC ${entry.cmc === 7 ? '7+' : entry.cmc} — ${entry.count} card${entry.count === 1 ? '' : 's'}`}
>
```

(Le reste du composant est inchangé.)

- [ ] **Step 2: Curseur d'aide sur les colonnes**

Dans `src/app/decks/[id]/components/ManaCurve/ManaCurve.module.css`, ajouter à la règle `.column` :

```css
.column {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	height: 100%;
	justify-content: flex-end;
	cursor: default;
}
```

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: passe.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/[id]/components/ManaCurve/
git commit -m "feat(deck-stats): ManaCurve hover tooltip (cmc + count)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Recomposer `DeckStats` (flux vertical + KPIs)

**Files:**

- Modify: `src/app/decks/[id]/components/DeckStats/DeckStats.tsx`
- Modify: `src/app/decks/[id]/components/DeckStats/DeckStats.module.css`

**Interfaces:**

- Consumes (Tasks 2,3,4): `DeckStats` élargi ; `ColorBalance` ; `TypeBar` ; `ManaCurve` (existant).
- Produces: `DeckStats` component, props inchangées (`stats`, `warnings`).

- [ ] **Step 1: Réécrire `DeckStats.tsx`**

Remplacer le contenu de `src/app/decks/[id]/components/DeckStats/DeckStats.tsx` par :

```tsx
'use client';

import type { DeckStats as DeckStatsType } from '@/lib/deck/utils/deck-stats';
import type { ValidationWarning } from '@/lib/deck/utils/format-rules';
import { ManaCurve } from '../ManaCurve/ManaCurve';
import { ColorBalance } from '../ColorBalance/ColorBalance';
import { TypeBar } from '../TypeBar/TypeBar';
import styles from './DeckStats.module.css';

type Props = {
	stats: DeckStatsType;
	warnings: ValidationWarning[];
};

export function DeckStats({ stats, warnings }: Props) {
	const kpis = [
		{ label: 'Cards', value: stats.totalCards },
		{ label: 'Avg CMC', value: stats.averageCmc.toFixed(2) },
		{ label: 'Lands', value: stats.landCount },
		{ label: 'Creatures', value: stats.typeDistribution.Creature },
	];

	return (
		<div className={styles.panel}>
			<div className={styles.kpis}>
				{kpis.map((k) => (
					<div key={k.label} className={styles.kpi}>
						<span className={styles.kpiValue}>{k.value}</span>
						<span className={styles.kpiLabel}>{k.label}</span>
					</div>
				))}
			</div>

			<hr className={styles.hair} />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Mana Curve</h3>
				<ManaCurve curve={stats.manaCurve} />
			</section>

			<hr className={styles.hair} />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Color Balance — Cost vs Production</h3>
				<ColorBalance cost={stats.colorsCost} production={stats.colorsProduction} />
			</section>

			<hr className={styles.hair} />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Types</h3>
				<TypeBar types={stats.typeDistribution} />
			</section>

			{warnings.length > 0 && (
				<>
					<hr className={styles.hair} />
					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Warnings</h3>
						{warnings.map((w, i) => (
							<div key={i} className={styles.warning}>
								{w.message}
							</div>
						))}
					</section>
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Réécrire `DeckStats.module.css`**

Remplacer le contenu de `src/app/decks/[id]/components/DeckStats/DeckStats.module.css` par :

```css
.panel {
	margin-top: 24px;
	padding: 20px 24px;
	background: var(--glass-bg);
	border: 1px solid var(--glass-border);
	border-radius: 2px;
	backdrop-filter: blur(var(--glass-blur));
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.kpis {
	display: flex;
	gap: 24px;
}

.kpi {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.kpiValue {
	font-size: var(--text-xl, 1.5rem);
	font-weight: 700;
	color: var(--gold);
	line-height: 1.1;
}

.kpiLabel {
	font-size: var(--text-xs);
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: var(--text-muted);
}

.hair {
	height: 1px;
	border: 0;
	margin: 0;
	background: linear-gradient(90deg, transparent, var(--glass-border), transparent);
}

.section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.sectionTitle {
	font-size: var(--text-base);
	font-weight: 600;
	color: var(--brass);
	margin: 0;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.warning {
	padding: 10px 14px;
	font-size: var(--text-base);
	color: var(--warning);
	background: rgba(201, 168, 76, 0.1);
	border: 1px solid rgba(201, 168, 76, 0.2);
	border-radius: 6px;
	margin-bottom: 6px;
}

.warning:last-child {
	margin-bottom: 0;
}

@media (max-width: 768px) {
	.panel {
		padding: 16px;
	}
	.kpis {
		gap: 16px;
	}
}
```

- [ ] **Step 3: Vérifier le typage/lint**

Run: `npm run check`
Expected: passe. (`DeckFooter` compile toujours : `colorDistribution` intact.)

- [ ] **Step 4: Vérification runtime**

Run: `npm run dev`

Ouvrir `/decks/[id]` sur trois decks : (a) mono-couleur, (b) multicolore avec dorks/rocks, (c) un deck contenant au moins une carte double-face ou un MDFC terrain.

Vérifier visuellement :

- Panneau de verre continu, filets dorés entre sections, coins nets.
- KPIs : Cards = nb physique (pas gonflé par les faces), Avg CMC, Lands, Creatures cohérents.
- Mana Curve : barres brass→gold, tooltip au survol.
- Color Balance : deux barres Cost/Production alignées, couleurs mana correctes ; note dorée neutre si un écart ≥ 12 pts.
- Types : ruban + légende, comptes cohérents.
- Footer inchangé (pastilles de couleur toujours présentes).

- [ ] **Step 5: Commit**

```bash
git add src/app/decks/[id]/components/DeckStats/
git commit -m "feat(deck-stats): recompose DeckStats into analysis-first flow

KPIs + mana curve + color balance + type ribbon in one glass panel.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Polish `MiniManaCurve`

**Files:**

- Modify: `src/app/decks/components/DeckCard/MiniManaCurve.module.css`

**Interfaces:**

- Consumes/Produces: inchangé.

- [ ] **Step 1: Accentuer la barre la plus haute + cohérence dégradé**

Dans `src/app/decks/components/DeckCard/MiniManaCurve.module.css`, remplacer la règle `.bar` par :

```css
.bar {
	width: 100%;
	min-height: 2px;
	background: linear-gradient(to top, var(--brass), var(--gold));
	border-radius: 1px 1px 0 0;
	animation: riseUp 0.4s ease-out both;
	animation-delay: calc(var(--col-index) * 40ms);
	opacity: 0.85;
	transition: opacity 0.2s ease;
}

.container:hover .bar {
	opacity: 1;
}
```

(Amélioration légère, sans nouvelle donnée : les barres s'illuminent au survol de la carte, cohérent avec la DA. Signature du composant inchangée.)

- [ ] **Step 2: Vérifier**

Run: `npm run check`
Expected: passe.

- [ ] **Step 3: Vérification runtime**

Run: `npm run dev` (si pas déjà lancé), ouvrir `/decks` (liste). Survoler une DeckCard : la mini-courbe passe à pleine opacité. Rendu cohérent avec la grande courbe.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/components/DeckCard/MiniManaCurve.module.css
git commit -m "feat(deck-stats): MiniManaCurve hover polish

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage :**

- Colors cost (pips, hybride 0.5) → Task 1 (`parseColorPips`) + Task 2 (agrégation) + Task 3 (affichage). ✓
- Colors production (toutes sources, niveau carte) → Task 2 + Task 3. ✓
- Équilibre manabase (note neutre) → Task 3 (`ColorBalance`, seuil 12 pts). ✓
- Distribution des types → Task 1 (`categorizeType`) + Task 2 + Task 4 (`TypeBar`). ✓
- Double-face = faces distinctes dans distributions, totaux physiques → Task 2 (test dédié). ✓
- Ratio terrains informatif → KPI `Lands` (Task 6), aucune alerte. ✓
- Flux B / DA verre-or → Task 6 (`DeckStats` recomposé). ✓
- MiniManaCurve polish → Task 7. ✓
- Pas de renommage `colorDistribution` (compat `DeckFooter`) → contrainte globale respectée dans Task 2 & 6. ✓
- Pas de dépendance nouvelle, CSS pur → toutes tâches. ✓

**Type consistency :** `ManaColor`/`ProdColor`/`TypeCategory` définis en Task 1, réutilisés en Task 2 ; `colorsCost`/`colorsProduction`/`typeDistribution` consommés en Tasks 3/4/6 avec les mêmes noms. `computeDeckStats` signature inchangée → hooks intacts. ✓

**Placeholders :** aucun TODO/TBD ; tout le code est fourni ; les vérifications sont des scripts `tsx` concrets supprimés avant commit. ✓
