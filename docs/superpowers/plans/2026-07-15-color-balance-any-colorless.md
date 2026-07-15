# Color Balance — Any Color & Colorless Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher le mana "n'importe quelle couleur" (sources 5-couleurs) dans un segment "Any Color" dédié et rendre le mana incolore `{C}` visible, sans gonfler les couleurs individuelles.

**Architecture:** On étend le modèle de balance à 7 clés `W|U|B|R|G|C|ANY`. `computeDeckStats` agrège la production (source 5-couleurs → `ANY`, sinon +1/couleur ; `C` séparé) et le coût (`{C}` compté, générique ignoré). `ColorBalance` recalibre les % sur les segments de chaque barre et garde les notes sur une base WUBRG normalisée.

**Tech Stack:** TypeScript, Next.js (client component), CSS modules, next-intl.

## Global Constraints

- **Pas de framework de test** : vérifier via script jetable `tsx` + `npm run check` + runtime. Ne jamais introduire vitest/jest.
- **`npm run check` baseline RED** : ~60 problèmes préexistants dans des fichiers non liés. Gate = "aucun nouveau problème" sur les fichiers modifiés (`npx eslint <fichier>` + `npx prettier --check <fichier>`).
- **Type Scryfall incomplet** : `ScryfallColor = 'W'|'U'|'B'|'R'|'G'` n'inclut pas `'C'`, mais l'API renvoie `"C"` dans `produced_mana`. Caster au runtime comme le code existant (`color in colorsProduction`).
- Labels visibles toujours ajoutés dans `messages/fr.json` ET `messages/en.json`.

---

### Task 1: Étendre `parseColorPips` pour compter l'incolore `{C}`

**Files:**

- Modify: `src/lib/deck/utils/mana-cost.ts`

**Interfaces:**

- Produces: `parseColorPips(manaCost: string): Record<'W'|'U'|'B'|'R'|'G'|'C', number>` — ajoute la clé `C` (pips `{C}` incolore pur). WUBRG inchangés. Générique/X/snow toujours ignorés.

- [ ] **Step 1: Écrire le script de vérification jetable**

Créer `/tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/347d5994-5d2e-4f7a-ab8c-86611de771b6/scratchpad/check-pips.ts` :

```ts
import { parseColorPips } from '../../../src/lib/deck/utils/mana-cost';

function eq(name: string, got: unknown, want: unknown) {
	const g = JSON.stringify(got);
	const w = JSON.stringify(want);
	console.log(`${g === w ? 'PASS' : 'FAIL'} ${name} got=${g} want=${w}`);
}

// {C} incolore pur compté
eq('C pip', parseColorPips('{1}{C}{C}'), { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 });
// générique ignoré, couleur comptée
eq('generic+color', parseColorPips('{2}{G}'), { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 });
// hybride 0.5 inchangé
eq('hybrid', parseColorPips('{G/U}'), { W: 0, U: 0.5, B: 0, R: 0, G: 0.5, C: 0 });
```

(Chemin relatif à ajuster selon l'emplacement réel ; utiliser un chemin absolu vers le module si besoin.)

- [ ] **Step 2: Lancer le script — doit échouer**

Run: `npx tsx <scratchpad>/check-pips.ts`
Expected: `FAIL C pip` (la clé `C` n'existe pas encore ; `generic+color` et `hybrid` peuvent FAIL car il manque `C:0`).

- [ ] **Step 3: Implémenter — ajouter la clé `C`**

Dans `src/lib/deck/utils/mana-cost.ts`, modifier `emptyPips` et `parseColorPips` :

```ts
function emptyPips(): Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function parseColorPips(
	manaCost: string
): Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', number> {
	const pips = emptyPips();
	if (!manaCost) return pips;
	// eslint-disable-next-line sonarjs/slow-regex -- safe: negation prevents backtracking
	const symbols = manaCost.match(/\{[^}]*\}/g) ?? [];
	for (const raw of symbols) {
		const inner = raw.slice(1, -1).toUpperCase();
		const parts = inner.split('/');
		// incolore pur {C} (jamais hybride)
		if (inner === 'C') {
			pips.C += 1;
			continue;
		}
		const colorParts = parts.filter((p): p is ManaColor => (COLORS as string[]).includes(p));
		if (colorParts.length === 0) continue; // générique / X / snow
		if (colorParts.length === 1) {
			pips[colorParts[0]] += 1;
		} else {
			for (const c of colorParts) pips[c] += 0.5;
		}
	}
	return pips;
}
```

- [ ] **Step 4: Lancer le script — doit passer**

Run: `npx tsx <scratchpad>/check-pips.ts`
Expected: `PASS C pip`, `PASS generic+color`, `PASS hybrid`.

- [ ] **Step 5: Lint/format**

Run: `npx eslint src/lib/deck/utils/mana-cost.ts && npx prettier --check src/lib/deck/utils/mana-cost.ts`
Expected: aucun nouveau problème.

- [ ] **Step 6: Commit**

```bash
git add src/lib/deck/utils/mana-cost.ts
git commit -m "feat: count colorless {C} pips in parseColorPips"
```

---

### Task 2: Agréger `ANY` et `C` dans `computeDeckStats`

**Files:**

- Modify: `src/lib/deck/utils/deck-stats.ts`
- Modify: `src/lib/deck/utils/mana-cost.ts` (ajouter le type `BalanceKey`)

**Interfaces:**

- Consumes: `parseColorPips(...)` retournant la clé `C` (Task 1).
- Produces:
  - `type BalanceKey = 'W'|'U'|'B'|'R'|'G'|'C'|'ANY'` (exporté depuis `mana-cost.ts`).
  - `DeckStats.colorsCost: Record<BalanceKey, number>` (ANY toujours 0 côté coût).
  - `DeckStats.colorsProduction: Record<BalanceKey, number>`.

- [ ] **Step 1: Écrire le script de vérification jetable**

Créer `<scratchpad>/check-stats.ts` :

```ts
import { computeDeckStats } from '../../../src/lib/deck/utils/deck-stats';
import type { ScryfallCard } from '../../../src/lib/scryfall/types/scryfall';

function card(partial: Partial<ScryfallCard>): { card: ScryfallCard; zone: 'mainboard' } {
	return {
		zone: 'mainboard',
		card: { name: 'x', type_line: 'Land', cmc: 0, ...partial } as ScryfallCard,
	};
}

function eq(name: string, got: unknown, want: unknown) {
	const g = JSON.stringify(got);
	const w = JSON.stringify(want);
	console.log(`${g === w ? 'PASS' : 'FAIL'} ${name} got=${g}`);
}

// Source arc-en-ciel 5 couleurs → ANY += 1, couleurs individuelles à 0
const rainbow = computeDeckStats([card({ produced_mana: ['W', 'U', 'B', 'R', 'G'] as any })]);
eq('rainbow→ANY', rainbow.colorsProduction, { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ANY: 1 });

// Terre bicolore → +1 par couleur, ANY à 0
const dual = computeDeckStats([card({ produced_mana: ['U', 'R'] as any })]);
eq('dual→per-color', dual.colorsProduction, { W: 0, U: 1, B: 0, R: 1, G: 0, C: 0, ANY: 0 });

// Source incolore {C} → C += 1
const colorless = computeDeckStats([card({ produced_mana: ['C'] as any })]);
eq('C prod', colorless.colorsProduction, { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1, ANY: 0 });

// Coût Eldrazi {2}{C}{C} → C = 2 côté coût
const eldrazi = computeDeckStats([
	card({ type_line: 'Creature', cmc: 4, mana_cost: '{2}{C}{C}', produced_mana: undefined }),
]);
eq('C cost', eldrazi.colorsCost, { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2, ANY: 0 });
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npx tsx <scratchpad>/check-stats.ts`
Expected: `FAIL rainbow→ANY` (aujourd'hui +1 sur chaque couleur), `FAIL C cost` (C absent du coût).

- [ ] **Step 3: Ajouter `BalanceKey` dans `mana-cost.ts`**

Après `export type ProdColor = ManaColor | 'C';` ajouter :

```ts
export type BalanceKey = ManaColor | 'C' | 'ANY';
```

- [ ] **Step 4: Réécrire l'agrégation dans `deck-stats.ts`**

Remplacer les imports de type et les helpers `emptyCost`/`emptyProduction`, et la boucle de production/coût :

```ts
import {
	parseColorPips,
	iterateFaces,
	categorizeType,
	type BalanceKey,
	type TypeCategory,
} from './mana-cost';

// ...

const MANA_COLORS: Array<'W' | 'U' | 'B' | 'R' | 'G'> = ['W', 'U', 'B', 'R', 'G'];

function emptyBalance(): Record<BalanceKey, number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ANY: 0 };
}
```

Dans le type `DeckStats` :

```ts
colorsCost: Record<BalanceKey, number>; // pips requis (hybride 0.5, {C} inclus)
colorsProduction: Record<BalanceKey, number>; // sources ({C} + ANY pour 5-couleurs)
```

Init :

```ts
const colorsCost = emptyBalance();
const colorsProduction = emptyBalance();
```

Boucle production (remplace le bloc `for (const color of card.produced_mana ?? [])`) :

```ts
// Production : au niveau carte (produced_mana absent des faces)
const prod = (card.produced_mana ?? []) as string[];
const wubrgProduced = MANA_COLORS.filter((c) => prod.includes(c));
if (wubrgProduced.length === 5) {
	colorsProduction.ANY += 1; // source arc-en-ciel → catégorie dédiée
} else {
	for (const c of wubrgProduced) colorsProduction[c] += 1;
}
if (prod.includes('C')) colorsProduction.C += 1;
```

Boucle coût (remplace `for (const c of MANA_COLORS) colorsCost[c] += pips[c];`) :

```ts
const pips = parseColorPips(face.mana_cost ?? '');
for (const c of MANA_COLORS) colorsCost[c] += pips[c];
colorsCost.C += pips.C;
```

Supprimer les anciens helpers `emptyCost` et `emptyProduction`.

- [ ] **Step 5: Lancer — doit passer**

Run: `npx tsx <scratchpad>/check-stats.ts`
Expected: `PASS rainbow→ANY`, `PASS dual→per-color`, `PASS C prod`, `PASS C cost`.

- [ ] **Step 6: Lint/format**

Run: `npx eslint src/lib/deck/utils/deck-stats.ts src/lib/deck/utils/mana-cost.ts && npx prettier --check src/lib/deck/utils/deck-stats.ts src/lib/deck/utils/mana-cost.ts`
Expected: aucun nouveau problème.

- [ ] **Step 7: Commit**

```bash
git add src/lib/deck/utils/deck-stats.ts src/lib/deck/utils/mana-cost.ts
git commit -m "feat: aggregate any-color and colorless mana in deck stats"
```

---

### Task 3: Labels i18n pour Colorless et Any Color

**Files:**

- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**

- Produces: clés `decks.colorBalanceColorless`, `decks.colorBalanceAny`.

- [ ] **Step 1: Ajouter les clés FR**

Dans `messages/fr.json`, après `"colorBalanceProduction": "Production",` (ligne ~532) :

```json
		"colorBalanceColorless": "Incolore",
		"colorBalanceAny": "Toutes couleurs",
```

- [ ] **Step 2: Ajouter les clés EN**

Dans `messages/en.json`, après `"colorBalanceProduction": "Production",` :

```json
		"colorBalanceColorless": "Colorless",
		"colorBalanceAny": "Any Color",
```

- [ ] **Step 3: Format**

Run: `npx prettier --check messages/fr.json messages/en.json`
Expected: OK (sinon `npx prettier --write` puis re-check).

- [ ] **Step 4: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "i18n: add colorless and any-color balance labels"
```

---

### Task 4: Rendu des segments `C` et `ANY` + recalibrage dans `ColorBalance`

**Files:**

- Modify: `src/app/[locale]/decks/[id]/components/ColorBalance/ColorBalance.tsx`
- Modify: `src/app/[locale]/decks/[id]/components/ColorBalance/ColorBalance.module.css`

**Interfaces:**

- Consumes: `stats.colorsCost` / `stats.colorsProduction` de type `Record<BalanceKey, number>` (Task 2) ; clés i18n (Task 3).

- [ ] **Step 1: Étendre les constantes et couleurs dans `ColorBalance.tsx`**

Remplacer les constantes de haut de fichier :

```ts
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
const COST_KEYS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
const PROD_KEYS = ['W', 'U', 'B', 'R', 'G', 'C', 'ANY'] as const;

const COLOR_CSS: Record<string, string> = {
	W: 'var(--mana-white)',
	U: 'var(--mana-blue)',
	B: 'var(--mana-black)',
	R: 'var(--mana-red)',
	G: 'var(--mana-green)',
	C: 'var(--mana-colorless)',
	ANY: 'linear-gradient(90deg, var(--mana-white), var(--mana-blue), var(--mana-black), var(--mana-red), var(--mana-green))',
};
```

Et les labels (avec i18n pour C/ANY, statiques pour WUBRG) :

```ts
const COLOR_LABELS: Record<string, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green',
};
```

- [ ] **Step 2: Généraliser `StackedBar` sur des clés arbitraires**

`StackedBar` accepte déjà `keys` + `values`. Le rendu du segment utilise `COLOR_CSS[k]` (déjà OK pour C/ANY) et `title`. Adapter le `title` pour C/ANY via une map de libellés passée en prop :

```tsx
function StackedBar({
	label,
	values,
	keys,
	segLabels,
}: {
	label: string;
	values: (k: string) => number;
	keys: readonly string[];
	segLabels: Record<string, string>;
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
							title={`${segLabels[k] ?? k}: ${Math.round(w)}%`}
						/>
					);
				})}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Recalibrer les % et découpler les notes dans `ColorBalance`**

Remplacer le corps de `ColorBalance` :

```tsx
export function ColorBalance({ cost, production }: Props) {
	const t = useTranslations('decks');

	// libellés de segment (WUBRG statiques + C/ANY traduits)
	const segLabels: Record<string, string> = {
		...COLOR_LABELS,
		C: t('colorBalanceColorless'),
		ANY: t('colorBalanceAny'),
	};

	// % d'affichage : recalibrés sur les segments de chaque barre
	const costPctBar = pct(cost, COST_KEYS);
	const prodPctBar = pct(production, PROD_KEYS);

	// % des notes : base WUBRG normalisée à 5 couleurs seules (comparaison honnête)
	const costPctWubrg = pct(cost, COLOR_ORDER);
	const prodPctWubrg = pct(production, COLOR_ORDER);

	const hasCost = COST_KEYS.some((k) => (cost[k] ?? 0) > 0);
	const hasProd = PROD_KEYS.some((k) => (production[k] ?? 0) > 0);
	if (!hasCost && !hasProd) return null;

	const notes = COLOR_ORDER.filter((k) => (cost[k] ?? 0) > 0 || (production[k] ?? 0) > 0)
		.map((k) => ({ k, gap: Math.round(costPctWubrg(k) - prodPctWubrg(k)) }))
		.filter((n) => Math.abs(n.gap) >= NOTE_THRESHOLD);

	return (
		<div className={styles.container}>
			<StackedBar
				label={t('colorBalanceCost')}
				values={costPctBar}
				keys={COST_KEYS}
				segLabels={segLabels}
			/>
			<StackedBar
				label={t('colorBalanceProduction')}
				values={prodPctBar}
				keys={PROD_KEYS}
				segLabels={segLabels}
			/>
			{notes.length > 0 && (
				<ul className={styles.notes}>
					{notes.map(({ k }) => (
						<li key={k} className={styles.note}>
							<ColorIdentityIcons colors={[k]} size={14} />
							{t('colorBalanceNote', {
								color: COLOR_LABELS[k] ?? k,
								costPct: Math.round(costPctWubrg(k)),
								prodPct: Math.round(prodPctWubrg(k)),
							})}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
```

Note : `Props.cost`/`production` restent `Record<string, number>` — compatibles avec `Record<BalanceKey, number>`. Vérifier que `pct` accepte `readonly string[]` (il prend déjà `readonly string[]`).

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep ColorBalance || echo "no ColorBalance TS errors"`
Then: `npx eslint "src/app/[locale]/decks/[id]/components/ColorBalance/ColorBalance.tsx" && npx prettier --check "src/app/[locale]/decks/[id]/components/ColorBalance/ColorBalance.tsx"`
Expected: aucun nouveau problème.

- [ ] **Step 5: Vérifier le CSS (segment gradient OK)**

Le `.segment` utilise `background` en style inline (déjà le cas). Aucun changement CSS requis pour le gradient. Confirmer que `.rowLabel { width: 96px }` est en place (fix précédent).

Run: `npx prettier --check "src/app/[locale]/decks/[id]/components/ColorBalance/ColorBalance.module.css"`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/decks/[id]/components/ColorBalance/"
git commit -m "feat: render colorless and any-color segments in color balance"
```

---

### Task 5: Vérification runtime

**Files:** aucun (vérification).

- [ ] **Step 1: `npm run check` global — comparer à la baseline**

Run: `npm run check 2>&1 | tail -30`
Expected: aucun NOUVEAU problème imputable aux fichiers modifiés (baseline RED ~60 préexistants tolérée).

- [ ] **Step 2: Runtime sur la page deck**

Lancer le dev server, ouvrir un deck contenant une source arc-en-ciel (ou Eldrazi {C}) en locale FR :

- Segment "Toutes couleurs" (doré) visible dans la barre Production.
- Segment "Incolore" (gris) visible si {C} présent (coût et/ou prod).
- Barres Coût et Production alignées (même début, même fin).
- Label "PRODUCTION" ne chevauche plus la barre.

- [ ] **Step 3: Nettoyer les scripts jetables**

```bash
rm -f <scratchpad>/check-pips.ts <scratchpad>/check-stats.ts
```

---

## Self-Review

- **Spec coverage** : Any Color 5-couleurs (Task 2 ✓), Colorless coût+prod (Task 1+2 ✓), générique ignoré (Task 1 ✓), recalibrage barres (Task 4 ✓), notes base WUBRG (Task 4 ✓), i18n (Task 3 ✓). Aucun gap.
- **Placeholders** : aucun — code complet fourni à chaque step.
- **Type consistency** : `BalanceKey` défini Task 2, consommé Task 4. `parseColorPips` retourne `C` (Task 1) consommé Task 2. `costPctBar`/`prodPctBar`/`costPctWubrg`/`prodPctWubrg`/`segLabels` cohérents dans Task 4.
