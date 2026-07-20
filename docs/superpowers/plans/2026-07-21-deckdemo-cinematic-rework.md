# DeckDemo Cinematic Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the landing "Deckbuilding" demo so cards deal in first and the mana curve, color ring, and type chips resolve out of them — with every stat computed from the actual card list.

**Architecture:** A single `DECK_SAMPLE` card array (with real cmc/colors/type) becomes the source of truth in `demoContent.ts`. Pure helper functions derive the curve, color slices, and type counts from it. `DeckDemo.tsx` plays a reversed, overlapping scroll timeline (deal-in → curve → ring → chips) using the existing `seg()` mapper and the `progress` prop from `PinnedFeature`.

**Tech Stack:** Next.js (client component), CSS modules, `next/image` via `scryfallImageLoader`. No test framework in this repo — verification is `npm run check` (eslint gate) + runtime.

## Global Constraints

- No test framework (no vitest/jest). Verify via `npm run check` and runtime; gate on **no NEW** eslint problems on changed files via `npx eslint <files>` (base `npm run check` is RED with ~60 pre-existing unrelated problems).
- Landing must render deterministically and offline — no runtime data fetch. All card data is baked constants.
- Scryfall image URLs must be `cards.scryfall.io` normal-size and rendered through `scryfallImageLoader` with `unoptimized={isScryfallImageUrl(src)}` (default UA is blocked). Strip any `?…` query suffix to match existing bare-URL style.
- Reduced-motion / mobile: `PinnedFeature` forces `progress = 1`; the resolved end state (cards + all stats visible) must be correct at `progress === 1`.
- Do NOT touch `SEARCH_CARDS` or `COLLECTION_CARDS` (shared by other demos).

---

## File Structure

- `src/app/[locale]/(landing)/data/demoContent.ts` — add `DemoDeckCard` interface, `DECK_SAMPLE` array, and derive helpers (`deckCurve`, `deckColorSlices`, `deckTypeCounts`, `columnTint`); remove `HAND_CARDS`, `MANA_CURVE`, `COLOR_SLICES`.
- `src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx` — reversed timeline, deal-in cards, bars-from-cards, ring, type chips.
- `src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.module.css` — deal-in transforms, bar/card composition, chip styles.

Verified card data (from Scryfall API, 2026-07-21):

| Card                  | cmc | colors | type         | image id                                      |
| --------------------- | --- | ------ | ------------ | --------------------------------------------- |
| Llanowar Elves        | 1   | G      | Creature     | 6a0b230b-d391-4998-a3f7-7b158a0ec2cd (loaded) |
| Birds of Paradise     | 1   | G      | Creature     | 492c2f9a-51e7-4e0f-9899-23bf43ea988b (loaded) |
| Goblin Guide          | 1   | R      | Creature     | 3c0f5411-1940-410f-96ce-6f92513f753a (loaded) |
| Monastery Swiftspear  | 1   | R      | Creature     | d6bfa227-4309-40ed-952c-279595eab17e (loaded) |
| Lightning Bolt        | 1   | R      | Instant      | 7673784e-db4b-43a1-8d55-1bb9fc1e284f (loaded) |
| Burning-Tree Emissary | 2   | G,R    | Creature     | ba327a5e-bd57-4e24-b4b4-062202df30e1          |
| Domri Rade            | 3   | G,R    | Planeswalker | 9a7a5bbc-9d5a-461b-a5d7-a3f2e9b383be          |
| Bloodbraid Elf        | 4   | G,R    | Creature     | e2f12f6f-9383-47e6-a44f-2834ad130e51          |
| Glorybringer          | 5   | R      | Creature     | 06f90d62-6d21-47b1-a427-eb25a42f4dcb          |

Image URL pattern: `https://cards.scryfall.io/normal/front/<c1>/<c2>/<id>.jpg` where `<c1>/<c2>` are the first two hex chars of the id.

Derived results (must match after implementation):

- Curve (cmc 0..6+): `[0, 5, 1, 1, 1, 1, 0]`
- Color slices: R 58% / G 42% (7 R pips, 5 G pips, total 12; percentages via `Math.round`)
- Type counts: `{ Creature: 7, Instant: 1, Planeswalker: 1 }`
- Column tint (dominant color per cmc, **tie → 'R'** as lead archetype color): cmc1→R, cmc2→R, cmc3→R, cmc4→R, cmc5→R; empty columns → no tint.

---

## Task 1: Sample deck data + derive helpers

**Files:**

- Modify: `src/app/[locale]/(landing)/data/demoContent.ts`

**Interfaces:**

- Consumes: existing `DemoCard` interface in the same file.
- Produces:
  - `interface DemoDeckCard extends DemoCard { cmc: number; colors: string[]; type: 'Creature' | 'Instant' | 'Sorcery' | 'Artifact' | 'Land' | 'Enchantment' | 'Planeswalker'; }`
  - `const DECK_SAMPLE: DemoDeckCard[]`
  - `function deckCurve(deck: DemoDeckCard[]): number[]` — length 7, index = cmc, bucket `min(cmc,6)`.
  - `function deckColorSlices(deck: DemoDeckCard[]): { color: string; pct: number }[]` — one slice per color present (in WUBRG order R before G here), `color` is the hex used by the ring, `pct` = round(pips/totalPips*100). Colorless pip-less cards contribute nothing.
  - `function deckTypeCounts(deck: DemoDeckCard[]): { type: string; count: number }[]` — sorted by count desc, insertion-order tiebreak.
  - `function columnTint(deck: DemoDeckCard[], cmc: number): string | null` — hex color of dominant color among cards in that cmc bucket; tie → red; empty → `null`.

- [ ] **Step 1: Add `DemoDeckCard` interface and `DECK_SAMPLE`**

After the existing `DemoCard` interface / card consts, add the interface and the array. Reuse the 5 already-defined image URLs; add 4 new bare URLs. Example (write all 9):

```ts
export interface DemoDeckCard extends DemoCard {
	cmc: number;
	colors: string[]; // WUBRG letters; [] = colorless
	type: 'Creature' | 'Instant' | 'Sorcery' | 'Artifact' | 'Land' | 'Enchantment' | 'Planeswalker';
}

// Gruul (red-green) aggro sample. Real MTG values so every derived stat is the
// deck's own. Verified against the Scryfall API on 2026-07-21.
export const DECK_SAMPLE: DemoDeckCard[] = [
	{ ...LLANOWAR_ELVES, cmc: 1, colors: ['G'], type: 'Creature' },
	{ ...BIRDS_OF_PARADISE, cmc: 1, colors: ['G'], type: 'Creature' },
	{ ...GOBLIN_GUIDE, cmc: 1, colors: ['R'], type: 'Creature' },
	{ ...MONASTERY_SWIFTSPEAR, cmc: 1, colors: ['R'], type: 'Creature' },
	{ ...LIGHTNING_BOLT, cmc: 1, colors: ['R'], type: 'Instant' },
	{
		name: 'Burning-Tree Emissary',
		src: 'https://cards.scryfall.io/normal/front/b/a/ba327a5e-bd57-4e24-b4b4-062202df30e1.jpg',
		cmc: 2,
		colors: ['G', 'R'],
		type: 'Creature',
	},
	{
		name: 'Domri Rade',
		src: 'https://cards.scryfall.io/normal/front/9/a/9a7a5bbc-9d5a-461b-a5d7-a3f2e9b383be.jpg',
		cmc: 3,
		colors: ['G', 'R'],
		type: 'Planeswalker',
	},
	{
		name: 'Bloodbraid Elf',
		src: 'https://cards.scryfall.io/normal/front/e/2/e2f12f6f-9383-47e6-a44f-2834ad130e51.jpg',
		cmc: 4,
		colors: ['G', 'R'],
		type: 'Creature',
	},
	{
		name: 'Glorybringer',
		src: 'https://cards.scryfall.io/normal/front/0/6/06f90d62-6d21-47b1-a427-eb25a42f4dcb.jpg',
		cmc: 5,
		colors: ['R'],
		type: 'Creature',
	},
];
```

- [ ] **Step 2: Add color constants and derive helpers**

Add below `DECK_SAMPLE`. `COLOR_HEX` keeps the ring palette consistent with the old look (red `#d33`, gold-ish green — use MTG-ish green `#4a9c5d`; grey for colorless `#555`). WUBRG display order.

```ts
const COLOR_HEX: Record<string, string> = {
	W: '#e9e4d0',
	U: '#3b7dd8',
	B: '#333',
	R: '#d33',
	G: '#4a9c5d',
	C: '#555', // colorless / no pips
};
const WUBRG = ['W', 'U', 'B', 'R', 'G'];

export function deckCurve(deck: DemoDeckCard[]): number[] {
	const curve = new Array<number>(7).fill(0);
	for (const c of deck) curve[Math.min(c.cmc, 6)] += 1;
	return curve;
}

function colorPips(deck: DemoDeckCard[]): Map<string, number> {
	const pips = new Map<string, number>();
	for (const c of deck) {
		for (const col of c.colors) pips.set(col, (pips.get(col) ?? 0) + 1);
	}
	return pips;
}

export function deckColorSlices(deck: DemoDeckCard[]): { color: string; pct: number }[] {
	const pips = colorPips(deck);
	const total = [...pips.values()].reduce((a, b) => a + b, 0);
	if (total === 0) return [];
	return WUBRG.filter((col) => pips.has(col)).map((col) => ({
		color: COLOR_HEX[col],
		pct: Math.round(((pips.get(col) ?? 0) / total) * 100),
	}));
}

export function deckTypeCounts(deck: DemoDeckCard[]): { type: string; count: number }[] {
	const order: string[] = [];
	const counts = new Map<string, number>();
	for (const c of deck) {
		if (!counts.has(c.type)) order.push(c.type);
		counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
	}
	return order
		.map((type) => ({ type, count: counts.get(type) ?? 0 }))
		.sort((a, b) => b.count - a.count);
}

// Dominant color among cards in a cmc bucket, as a hex tint. Tie -> red (lead
// color of the Gruul archetype). Empty column -> null.
export function columnTint(deck: DemoDeckCard[], cmc: number): string | null {
	const pips = new Map<string, number>();
	for (const c of deck) {
		if (Math.min(c.cmc, 6) !== cmc) continue;
		for (const col of c.colors) pips.set(col, (pips.get(col) ?? 0) + 1);
	}
	if (pips.size === 0) return null;
	let best = 'R';
	let bestN = -1;
	for (const col of WUBRG) {
		const n = pips.get(col) ?? 0;
		if (n > bestN) {
			bestN = n;
			best = col;
		}
	}
	return COLOR_HEX[best];
}
```

- [ ] **Step 3: Remove the dead constants**

Delete `HAND_CARDS`, `MANA_CURVE`, and `COLOR_SLICES` from `demoContent.ts` (only DeckDemo consumed them, and Task 2 replaces that usage).

- [ ] **Step 4: Verify the file type-checks and lint is clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep demoContent || echo "no demoContent TS errors"`
Then: `npx eslint "src/app/[locale]/(landing)/data/demoContent.ts"`
Expected: no errors referencing `demoContent.ts`. (DeckDemo.tsx will still error on the removed imports until Task 2 — that is expected and not a regression to fix here.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/(landing)/data/demoContent.ts"
git commit -m "feat(landing): add DECK_SAMPLE + derived-stat helpers for DeckDemo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Reversed timeline in DeckDemo.tsx

**Files:**

- Modify (rewrite): `src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx`

**Interfaces:**

- Consumes from Task 1: `DECK_SAMPLE`, `deckCurve`, `deckColorSlices`, `deckTypeCounts`, `columnTint`, `DemoDeckCard`.
- Consumes existing: `seg` from `utils/seg`, `scryfallImageLoader`/`isScryfallImageUrl`.
- Produces: `DeckDemo({ progress }: { progress: number })` (unchanged signature — used by `FeatureSections.tsx`).

Timeline (overlapping beats, via `seg`):

- `deal = seg(progress, 0, 0.45)` — cards deal in (hero beat).
- `bars = seg(progress, 0.4, 0.7)` — curve grows.
- `ring = seg(progress, 0.6, 0.85)` — color ring sweeps.
- `chips = seg(progress, 0.8, 1)` — type chips.

- [ ] **Step 1: Rewrite the component**

Replace the whole file with:

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import {
	DECK_SAMPLE,
	deckColorSlices,
	deckCurve,
	deckTypeCounts,
	columnTint,
} from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './DeckDemo.module.css';

const CURVE = deckCurve(DECK_SAMPLE);
const SLICES = deckColorSlices(DECK_SAMPLE);
const TYPES = deckTypeCounts(DECK_SAMPLE);
const MAX_BAR = Math.max(...CURVE);

export function DeckDemo({ progress }: { progress: number }) {
	const deal = seg(progress, 0, 0.45); // cards deal in — hero beat
	const bars = seg(progress, 0.4, 0.7); // curve grows out of the cards
	const ring = seg(progress, 0.6, 0.85); // color ring sweeps
	const chips = seg(progress, 0.8, 1); // type chips resolve

	// Conic-gradient string whose colored arc sweeps in as `ring` goes 0 -> 1.
	const stops = SLICES.reduce<{ text: string[]; acc: number }>(
		(state, s) => {
			const start = state.acc;
			const end = start + s.pct;
			return { text: [...state.text, `${s.color} ${start * ring}% ${end * ring}%`], acc: end };
		},
		{ text: [], acc: 0 }
	).text.join(', ');

	// As the curve grows (bars > 0), cards recede/dim to hand focus to the stats.
	const cardsFocus = 1 - 0.55 * bars;

	return (
		<div className={styles.wrap}>
			<div className={styles.stage}>
				{/* Cards deal in first */}
				<div className={styles.hand} style={{ opacity: cardsFocus }}>
					{DECK_SAMPLE.map((card, i) => {
						const mid = (DECK_SAMPLE.length - 1) / 2;
						// Per-card stagger: each card finishes dealing a beat after the last.
						const local = Math.min(1, Math.max(0, deal * DECK_SAMPLE.length - i));
						const angle = (i - mid) * 6 * local;
						const y = Math.abs(i - mid) * 8 * local;
						// Deal from off-frame (right + down + tilted) into place.
						const dealX = (1 - local) * 260;
						const dealY = (1 - local) * 120;
						const dealRot = (1 - local) * 18;
						return (
							<div
								key={card.name}
								className={styles.handCard}
								style={{
									transform: `translate(${dealX}px, ${y + dealY}px) rotate(${angle + dealRot}deg)`,
									opacity: local,
								}}
							>
								<Image
									src={card.src}
									alt={card.name}
									width={98}
									height={137}
									loader={scryfallImageLoader}
									unoptimized={isScryfallImageUrl(card.src)}
									sizes="70px"
								/>
							</div>
						);
					})}
				</div>

				{/* Mana curve grows up from the card baseline */}
				<div className={styles.bars} style={{ opacity: bars }}>
					{CURVE.map((v, i) => {
						const local = Math.min(1, Math.max(0, bars * CURVE.length - i));
						const tint = columnTint(DECK_SAMPLE, i);
						return (
							<span
								key={i}
								className={styles.bar}
								style={{
									height: `${MAX_BAR ? (v / MAX_BAR) * 100 * local : 0}%`,
									background: tint ?? 'rgba(201, 168, 76, 0.85)',
								}}
							/>
						);
					})}
				</div>
			</div>

			{/* Color-identity ring */}
			<div
				className={styles.ring}
				style={{
					opacity: ring,
					background: `conic-gradient(${stops}, transparent ${ring * 100}% 100%)`,
				}}
			/>

			{/* Type distribution chips */}
			<div className={styles.chips} style={{ opacity: chips }}>
				{TYPES.map((t) => (
					<span key={t.type} className={styles.chip}>
						{t.type}
						<b>{t.count}</b>
					</span>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify lint + types on the component**

Run: `npx eslint "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx"`
Then: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep DeckDemo || echo "no DeckDemo TS errors"`
Expected: no errors on DeckDemo.tsx. (CSS classes `stage`/`chips`/`chip` land in Task 3; missing CSS classes do not error in TS/eslint.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx"
git commit -m "feat(landing): DeckDemo plays cards-first, stats resolve from them

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: DeckDemo CSS — deal-in composition + chips

**Files:**

- Modify (rewrite): `src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.module.css`

**Interfaces:**

- Consumes: class names referenced by Task 2 — `.wrap`, `.stage`, `.hand`, `.handCard`, `.bars`, `.bar`, `.ring`, `.chips`, `.chip`.

- [ ] **Step 1: Rewrite the stylesheet**

```css
.wrap {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	justify-content: center;
	align-items: center;
}

/* The stage holds the dealt cards and the curve bars stacked in the same box,
   so the bars appear to grow up out of the card spread. ~520px .demo frame. */
.stage {
	position: relative;
	width: 100%;
	height: 240px;
	display: flex;
	justify-content: center;
	align-items: flex-end;
}

.hand {
	position: absolute;
	inset: 0;
	display: flex;
	justify-content: center;
	align-items: flex-end;
	transition: opacity 0.15s linear;
}
.handCard {
	margin: 0 -22px;
	transform-origin: bottom center;
	will-change: transform, opacity;
}
.handCard :global(img) {
	width: 96px;
	height: auto;
	border-radius: 5px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* Bars sit in front of the receding cards, anchored to the same baseline. */
.bars {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: flex-end;
	gap: 10px;
	height: 190px;
	transition: opacity 0.15s linear;
}
.bar {
	width: 26px;
	border-radius: 4px 4px 0 0;
	transition: height 0.1s linear;
}

.ring {
	width: 150px;
	height: 150px;
	border-radius: 50%;
	mask: radial-gradient(transparent 52%, #000 53%);
	-webkit-mask: radial-gradient(transparent 52%, #000 53%);
	transition: opacity 0.15s linear;
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	justify-content: center;
	transition: opacity 0.15s linear;
}
.chip {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.3rem 0.7rem;
	border-radius: 999px;
	font-size: 0.8rem;
	letter-spacing: 0.02em;
	color: rgba(255, 255, 255, 0.82);
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(201, 168, 76, 0.35);
}
.chip b {
	font-weight: 700;
	color: rgba(201, 168, 76, 0.95);
}
```

- [ ] **Step 2: Verify lint (prettier/stylelint via check) on the CSS**

Run: `npx eslint "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.module.css" 2>/dev/null || echo "css not eslinted (expected)"`
Then confirm no NEW problems overall on the three changed files:
Run: `npx eslint "src/app/[locale]/(landing)/data/demoContent.ts" "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx"`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.module.css"
git commit -m "feat(landing): DeckDemo deal-in card/curve composition + type chips

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Runtime verification + polish

**Files:** none (verification), plus any small CSS tweak this surfaces.

- [ ] **Step 1: Build check (catches TS2589 / generic-depth issues that per-file tsc misses)**

Run: `npm run build 2>&1 | tail -30`
Expected: build succeeds. If it fails on DeckDemo/demoContent, fix and re-run before continuing.

- [ ] **Step 2: Run dev and scroll the Deckbuilding section**

Run: `npm run dev` (background), open the landing page, scroll to feature #3 "Deckbuilding".
Verify by eye:

- Cards **deal in first** (staggered, from off-frame) — this is the dominant early beat.
- Then bars grow up from the card spread; cards dim/recede.
- Then the ring sweeps in (red-dominant, ~58/42 R/G).
- Then the type chips appear: Creature 7, Instant 1, Planeswalker 1.

- [ ] **Step 3: Verify the resolved end state (reduced-motion path)**

In devtools, emulate `prefers-reduced-motion: reduce` (or narrow to mobile width) and reload. `PinnedFeature` forces `progress = 1`: all cards fully dealt, bars at full derived heights, ring full, chips visible. Confirm nothing is stuck mid-animation.

- [ ] **Step 4: Final gate — no NEW problems on changed files**

Run: `npx eslint "src/app/[locale]/(landing)/data/demoContent.ts" "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx"`
Expected: clean (no NEW problems vs. the RED baseline).

- [ ] **Step 5: Commit any polish tweaks**

```bash
git add -A
git commit -m "polish(landing): DeckDemo runtime tweaks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Skip if nothing changed in this task.)

---

## Self-Review

**Spec coverage:**

- Cards-first reversed timeline → Task 2 (deal 0–0.45 leads). ✓
- Stats derived from card list → Task 1 helpers, consumed in Task 2. ✓
- Three stats (curve + ring + type chips) → Tasks 1–3. ✓
- Gruul archetype, real MTG values → Task 1 table (verified via Scryfall). ✓
- Remove dead `HAND_CARDS`/`MANA_CURVE`/`COLOR_SLICES`, keep shared consts → Task 1 Step 3 + Global Constraints. ✓
- Reduced-motion end state → Task 4 Step 3. ✓
- No copy changes, no fetch → Global Constraints + Out of scope. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; all card URLs and derived numbers are concrete/verified. ✓

**Type consistency:** `DemoDeckCard` (with `Planeswalker` in the union) defined in Task 1 and imported in Task 2; helper names (`deckCurve`, `deckColorSlices`, `deckTypeCounts`, `columnTint`) identical across tasks; `DeckDemo` signature unchanged so `FeatureSections.tsx` needs no edit. ✓
