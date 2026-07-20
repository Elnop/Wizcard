# Landing Cinematic Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the landing page as a cinematic, tool-showcase experience where each of six features gets a full-screen pinned section whose mini-demo plays as a pure function of scroll progress.

**Architecture:** A generic `PinnedFeature` shell turns per-section scroll into a `progress` value (0→1) via a homemade `useScrollProgress` hook. Six demo components are pure functions of `progress` — no real app components are mounted. On mobile / `prefers-reduced-motion`, the shell renders the demo's final state (`progress = 1`) with no pinning. All copy is `next-intl` (fr + en); all card imagery is fixed Scryfall URLs rendered through the existing `scryfallImageLoader`.

**Tech Stack:** Next.js 16 App Router, React 19 (React Compiler **off** — manage refs manually), TypeScript strict, CSS Modules, `next-intl`, `next/image` with `scryfallImageLoader`. **No animation library** (no GSAP/Framer).

## Global Constraints

- **No new dependencies.** Scroll/animation logic is homemade; only CSS transforms/opacity for motion.
- **No app components mounted in the landing.** Demos are self-contained mock chrome + fixed Scryfall card images + hardcoded chart data.
- **Every demo is a pure function of a `progress: number` prop (0→1).** No internal scroll/timer state that changes the final frame. Rendering at `progress={1}` must always show the complete final state.
- **Degradation:** on mobile **and** `prefers-reduced-motion`, `PinnedFeature` does not pin and passes `progress = 1` (static final state, normal scroll).
- **i18n:** all user-visible text via `next-intl`, namespace `landing.*`, in **both** `messages/fr.json` and `messages/en.json`. No hardcoded strings. `fr` is `defaultLocale`.
- **Scryfall images:** render via `next/image` with `loader={scryfallImageLoader}` and `unoptimized={isScryfallImageUrl(src)}` from `@/lib/scryfall/utils/scryfallImageLoader` (default UA is blocked on `cards.scryfall.io`).
- **Brand:** gold is `rgba(201, 168, 76, ...)` (matches `globals.css` crosshatch). Wordmark font family is `BRAND_FONT_FAMILY` from `@/fonts/brand`.
- **SEO:** keep `generateMetadata` + `buildAlternates(locale)` in `page.tsx`; home stays `index:true` (do not add robots overrides).
- **Verification (no test framework):** each task is verified by (a) `npx eslint <changed files>` clean + `npx tsc --noEmit` clean, and (b) a runtime check in `npm run dev`. Gate on **no NEW eslint problems** in changed files (baseline is red elsewhere). Prettier: run `npx prettier --write` on changed files before commit.
- **Links "Découvrir":** Search→`/search`, Collection→`/collection`, Deck→`/decks`, Import→`/collection`, PDF→`/decks` (PDF export lives in the deck-detail `DeckPdfExportModal`, there is no dedicated PDF route), Editor→**no link** (coming soon).
- **Path alias:** `@/*` → `./src/*`. **No barrel exports.** A component folder (`Name/Name.tsx` + `.module.css`) only when ≥2 files; a lone `.tsx` stays flat.

---

## File Structure

```
src/app/[locale]/(landing)/
  page.tsx                       # MODIFY: orchestrate Hero + 6 PinnedFeature(demo) + FinalCTA
  page.module.css                # MODIFY
  hooks/
    useInView.ts                 # KEEP as-is
    useScrollProgress.ts         # CREATE
    useReducedMotion.ts          # CREATE
    useIsMobile.ts               # CREATE
  data/
    demoContent.ts               # CREATE — fixed Scryfall URLs + chart/hand data + demo labels
  components/
    Hero/Hero.tsx (+.module.css)             # MODIFY (evolve: negative W, lighter art-deco, micro-parallax)
    PinnedFeature/PinnedFeature.tsx (+.css)  # CREATE — generic sticky shell + progress + fallback + layout
    demos/
      SearchDemo/SearchDemo.tsx (+.css)      # CREATE
      CollectionDemo/CollectionDemo.tsx (+.css)
      DeckDemo/DeckDemo.tsx (+.css)
      ImportDemo/ImportDemo.tsx (+.css)
      PdfDemo/PdfDemo.tsx (+.css)
      EditorDemo/EditorDemo.tsx (+.css)
    FinalCTA/FinalCTA.tsx (+.css)            # CREATE
  # DELETE at the end:
  components/Features/*, components/CardShowcase/* (+ showcaseData.ts),
  components/CallToAction/*, components/Hero/backdrops/*
messages/fr.json                 # MODIFY: rewrite landing.* namespace
messages/en.json                 # MODIFY: rewrite landing.* namespace
```

---

## Task 1: Motion primitives — `useReducedMotion`, `useIsMobile`, `useScrollProgress`

**Files:**

- Create: `src/app/[locale]/(landing)/hooks/useReducedMotion.ts`
- Create: `src/app/[locale]/(landing)/hooks/useIsMobile.ts`
- Create: `src/app/[locale]/(landing)/hooks/useScrollProgress.ts`

**Interfaces:**

- Produces:
  - `useReducedMotion(): boolean` — true when `(prefers-reduced-motion: reduce)` matches. SSR-safe (returns `false` on server).
  - `useIsMobile(breakpoint?: number): boolean` — true when `window.innerWidth < breakpoint` (default 768). SSR-safe (`false` on server).
  - `useScrollProgress(ref: RefObject<HTMLElement | null>): number` — 0 while the block's top is at/above viewport top with room below; ramps 0→1 as the block scrolls through its sticky travel; clamped `[0,1]`. Returns `0` on server. Uses a scroll listener on a rAF, cleaned up on unmount.

- [ ] **Step 1: Create `useReducedMotion`**

```ts
'use client';

import { useEffect, useState } from 'react';

// SSR renders false so the server markup matches the pre-hydration client;
// the effect then upgrades to the real value after mount.
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		setReduced(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);

	return reduced;
}
```

- [ ] **Step 2: Create `useIsMobile`**

```ts
'use client';

import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 768): boolean {
	const [mobile, setMobile] = useState(false);

	useEffect(() => {
		const check = () => setMobile(window.innerWidth < breakpoint);
		check();
		window.addEventListener('resize', check);
		return () => window.removeEventListener('resize', check);
	}, [breakpoint]);

	return mobile;
}
```

- [ ] **Step 3: Create `useScrollProgress`**

```ts
'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// Progress of a tall "pinned" block: 0 when its top hits the viewport top,
// 1 when its bottom reaches the viewport bottom (i.e. the sticky child has
// finished its travel). Read on a rAF so scroll never blocks on layout.
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
	const [progress, setProgress] = useState(0);
	const frame = useRef<number | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const compute = () => {
			frame.current = null;
			const rect = el.getBoundingClientRect();
			const travel = rect.height - window.innerHeight;
			if (travel <= 0) {
				setProgress(rect.top <= 0 ? 1 : 0);
				return;
			}
			// rect.top goes from 0 (block top at viewport top) to -travel.
			const p = Math.min(1, Math.max(0, -rect.top / travel));
			setProgress(p);
		};

		const onScroll = () => {
			if (frame.current !== null) return;
			frame.current = requestAnimationFrame(compute);
		};

		compute();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [ref]);

	return progress;
}
```

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/hooks/useReducedMotion.ts" "src/app/[locale]/(landing)/hooks/useIsMobile.ts" "src/app/[locale]/(landing)/hooks/useScrollProgress.ts"`
Expected: no errors on these files.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/hooks/useReducedMotion.ts" "src/app/[locale]/(landing)/hooks/useIsMobile.ts" "src/app/[locale]/(landing)/hooks/useScrollProgress.ts"
git add "src/app/[locale]/(landing)/hooks/"
git commit -m "feat(landing): scroll-progress and motion-preference hooks"
```

---

## Task 2: `PinnedFeature` generic shell

**Files:**

- Create: `src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.tsx`
- Create: `src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.module.css`

**Interfaces:**

- Consumes: `useScrollProgress`, `useReducedMotion`, `useIsMobile` (Task 1).
- Produces:

  ```ts
  interface PinnedFeatureProps {
  	index: number; // 1-based, drives the "01" label
  	label: string; // e.g. "Recherche"
  	title: string;
  	description: string;
  	href?: string; // "Découvrir" link target; omit → no link (Editor)
  	linkLabel?: string; // localized "Découvrir"
  	badge?: string; // e.g. "Bientôt" (Editor)
  	side: 'left' | 'right'; // which side the text column sits on
  	renderDemo: (progress: number) => ReactNode;
  }
  export function PinnedFeature(props: PinnedFeatureProps): JSX.Element;
  ```

  Behavior: outer `<section>` is `min-height: 260vh` (the scroll budget). Inner sticky wrapper is `position: sticky; top: var(--navbar-height); height: calc(100vh - var(--navbar-height))`. When `reduced || mobile`, `progress` passed to `renderDemo` is forced to `1` and the outer section collapses to `min-height: auto` (via a `static` class) so there is no pinning.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useRef, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { useScrollProgress } from '@/app/[locale]/(landing)/hooks/useScrollProgress';
import { useReducedMotion } from '@/app/[locale]/(landing)/hooks/useReducedMotion';
import { useIsMobile } from '@/app/[locale]/(landing)/hooks/useIsMobile';
import styles from './PinnedFeature.module.css';

interface PinnedFeatureProps {
	index: number;
	label: string;
	title: string;
	description: string;
	href?: string;
	linkLabel?: string;
	badge?: string;
	side: 'left' | 'right';
	renderDemo: (progress: number) => ReactNode;
}

export function PinnedFeature({
	index,
	label,
	title,
	description,
	href,
	linkLabel,
	badge,
	side,
	renderDemo,
}: PinnedFeatureProps) {
	const sectionRef = useRef<HTMLElement>(null);
	const reduced = useReducedMotion();
	const mobile = useIsMobile();
	const scrolled = useScrollProgress(sectionRef);
	const isStatic = reduced || mobile;
	const progress = isStatic ? 1 : scrolled;

	return (
		<section
			ref={sectionRef}
			className={`${styles.section} ${isStatic ? styles.static : ''} ${
				side === 'right' ? styles.reversed : ''
			}`}
		>
			<div className={styles.sticky}>
				<div className={styles.text}>
					<p className={styles.label}>
						<span className={styles.index}>{String(index).padStart(2, '0')}</span>
						{label}
						{badge ? <span className={styles.badge}>{badge}</span> : null}
					</p>
					<h2 className={styles.title}>{title}</h2>
					<p className={styles.description}>{description}</p>
					{href && linkLabel ? (
						<Link href={href} className={styles.link}>
							{linkLabel}
						</Link>
					) : null}
				</div>
				<div className={styles.demo}>{renderDemo(progress)}</div>
			</div>
		</section>
	);
}
```

- [ ] **Step 2: Write the CSS module**

```css
.section {
	min-height: 260vh;
	position: relative;
}
.static {
	min-height: auto;
}
.sticky {
	position: sticky;
	top: var(--navbar-height);
	height: calc(100vh - var(--navbar-height));
	display: grid;
	grid-template-columns: 1fr 1fr;
	align-items: center;
	gap: 3rem;
	max-width: 1200px;
	margin: 0 auto;
	padding: 0 2rem;
}
.static .sticky {
	position: static;
	height: auto;
	min-height: 80vh;
	padding: 4rem 2rem;
}
.reversed .text {
	order: 2;
}
.reversed .demo {
	order: 1;
}
.label {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	text-transform: uppercase;
	letter-spacing: 0.18em;
	font-size: 0.8rem;
	color: rgba(201, 168, 76, 0.9);
}
.index {
	font-variant-numeric: tabular-nums;
	opacity: 0.6;
}
.badge {
	padding: 0.15rem 0.5rem;
	border: 1px solid rgba(201, 168, 76, 0.6);
	border-radius: 999px;
	font-size: 0.65rem;
	letter-spacing: 0.1em;
}
.title {
	margin: 1rem 0;
	font-size: clamp(1.8rem, 4vw, 3rem);
	line-height: 1.05;
}
.description {
	max-width: 34ch;
	color: var(--text-muted, #b9bcc4);
	line-height: 1.6;
}
.link {
	display: inline-block;
	margin-top: 1.5rem;
	color: rgba(201, 168, 76, 1);
	border-bottom: 1px solid currentColor;
	padding-bottom: 2px;
}
.demo {
	position: relative;
	width: 100%;
	height: min(70vh, 520px);
}
@media (max-width: 768px) {
	.sticky {
		grid-template-columns: 1fr;
		gap: 2rem;
	}
	.reversed .text,
	.reversed .demo {
		order: 0;
	}
}
@media (prefers-reduced-motion: reduce) {
	.section {
		min-height: auto;
	}
	.sticky {
		position: static;
		height: auto;
		min-height: 80vh;
	}
}
```

- [ ] **Step 3: Temporary harness render — verify final state at progress=1**

Temporarily add to `page.tsx` (revert after): a single `<PinnedFeature ... renderDemo={(p) => <div>progress: {p.toFixed(2)}</div>} />`. Run `npm run dev`, load `/`, scroll through the section, confirm the number ramps 0→1 on desktop and is pinned; resize below 768px and confirm it shows `1.00` and does not pin.

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.tsx"`
Expected: no errors on this file.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/PinnedFeature/"
git add "src/app/[locale]/(landing)/components/PinnedFeature/"
git commit -m "feat(landing): generic PinnedFeature sticky shell"
```

---

## Task 3: Demo content data module

**Files:**

- Create: `src/app/[locale]/(landing)/data/demoContent.ts`

**Interfaces:**

- Produces (all values hardcoded, no runtime fetch):

  ```ts
  export interface DemoCard {
  	name: string;
  	src: string;
  } // src = cards.scryfall.io URL
  export const SEARCH_CARDS: DemoCard[]; // 3 cards (e.g. Lightning Bolt printings/red staples)
  export const COLLECTION_CARDS: DemoCard[]; // ~9 cards for the fill grid
  export const HAND_CARDS: DemoCard[]; // 7 cards for the opening hand
  export const MANA_CURVE: number[]; // 7 bars, values 0..N (cmc 0..6+)
  export const COLOR_SLICES: { color: string; pct: number }[]; // sums to 100
  export const IMPORT_SOURCES: string[]; // ['Moxfield','MTG Arena','CardNexus','Delver Lens']
  export const COLLECTION_TARGET = 1248; // counter end value
  export const IMPORT_RECOGNIZED = 60; // recognized-cards count
  ```

  All Scryfall URLs are `https://cards.scryfall.io/normal/...` form (the loader passes them through). Use well-known stable card image URLs.

- [ ] **Step 1: Create the data module**

```ts
// Fixed showcase data. No runtime fetch — the landing must render
// deterministically and offline. Scryfall image URLs go through
// scryfallImageLoader (default UA is blocked on cards.scryfall.io).

export interface DemoCard {
	name: string;
	src: string;
}

// Stable normal-size Scryfall image URLs (replace ids if any 404 at build).
export const SEARCH_CARDS: DemoCard[] = [
	{
		name: 'Lightning Bolt',
		src: 'https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg',
	},
	{
		name: 'Goblin Guide',
		src: 'https://cards.scryfall.io/normal/front/6/7/67f4c93b-080c-4196-b095-6a120a221988.jpg',
	},
	{
		name: 'Monastery Swiftspear',
		src: 'https://cards.scryfall.io/normal/front/e/6/e6d3fh...replace-me.jpg',
	},
];

export const COLLECTION_CARDS: DemoCard[] = SEARCH_CARDS.concat(SEARCH_CARDS).concat(SEARCH_CARDS);

export const HAND_CARDS: DemoCard[] = [
	SEARCH_CARDS[0],
	SEARCH_CARDS[1],
	SEARCH_CARDS[2],
	SEARCH_CARDS[0],
	SEARCH_CARDS[1],
	SEARCH_CARDS[2],
	SEARCH_CARDS[0],
];

export const MANA_CURVE: number[] = [2, 6, 9, 7, 4, 2, 1]; // cmc 0..6+

export const COLOR_SLICES: { color: string; pct: number }[] = [
	{ color: '#d33', pct: 55 },
	{ color: '#333', pct: 20 },
	{ color: '#c9a84c', pct: 25 },
];

export const IMPORT_SOURCES: string[] = ['Moxfield', 'MTG Arena', 'CardNexus', 'Delver Lens'];

export const COLLECTION_TARGET = 1248;
export const IMPORT_RECOGNIZED = 60;
```

- [ ] **Step 2: Resolve real Scryfall image URLs**

The `replace-me` placeholder above MUST be replaced with a real URL before commit. In `npm run dev`, open each `src` directly in the browser (or fetch via the app's Scryfall client) and confirm it returns an image; fix any 404. Confirm `SEARCH_CARDS` has three distinct valid URLs. No placeholder tokens may remain.

- [ ] **Step 3: Verify types + lint + no placeholder**

Run: `grep -n "replace-me" "src/app/[locale]/(landing)/data/demoContent.ts"` → Expected: no output.
Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/data/demoContent.ts"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/data/demoContent.ts"
git add "src/app/[locale]/(landing)/data/demoContent.ts"
git commit -m "feat(landing): fixed demo content (cards, curve, colors, sources)"
```

---

## Task 4: `SearchDemo`

**Files:**

- Create: `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx`
- Create: `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.module.css`

**Interfaces:**

- Consumes: `SEARCH_CARDS` (Task 3); `scryfallImageLoader`, `isScryfallImageUrl`.
- Produces: `export function SearchDemo({ progress }: { progress: number }): JSX.Element;`
- Beats (pure function of `progress`): 0–0.3 typed query width = `clamp(progress/0.3)`; 0.3–0.4 red filter chip lights; 0.4–0.7 three cards cascade in (per-card opacity/translateY staggered); 0.7–1 first card lifts (tilt + scale) into a detail preview.

- [ ] **Step 1: Write a `lerp`/`clampRange` helper inline + component**

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { SEARCH_CARDS } from '@/app/[locale]/(landing)/data/demoContent';
import styles from './SearchDemo.module.css';

// Map progress within [a,b] to 0..1, clamped outside.
function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

const QUERY = 'Lightning Bolt';

export function SearchDemo({ progress }: { progress: number }) {
	const typed = seg(progress, 0, 0.3);
	const filterOn = progress >= 0.35;
	const cardsIn = seg(progress, 0.4, 0.7);
	const lift = seg(progress, 0.7, 1);
	const shown = QUERY.slice(0, Math.round(QUERY.length * typed));

	return (
		<div className={styles.wrap}>
			<div className={styles.bar}>
				<span className={styles.icon}>⌕</span>
				<span className={styles.query}>{shown}</span>
				<span className={styles.caret} />
			</div>
			<div className={styles.filters}>
				<span className={`${styles.chip} ${filterOn ? styles.chipOn : ''}`}>R</span>
			</div>
			<div className={styles.results}>
				{SEARCH_CARDS.map((card, i) => {
					const local = Math.min(1, Math.max(0, cardsIn * 3 - i));
					const isHero = i === 0;
					const style = {
						opacity: local,
						transform: `translateY(${(1 - local) * 24}px) ${
							isHero ? `scale(${1 + lift * 0.3}) rotate(${-lift * 4}deg)` : ''
						}`,
						zIndex: isHero ? 3 : 1,
					};
					return (
						<div key={i} className={styles.card} style={style}>
							<Image
								src={card.src}
								alt={card.name}
								width={244}
								height={340}
								loader={scryfallImageLoader}
								unoptimized={isScryfallImageUrl(card.src)}
								sizes="200px"
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS module**

```css
.wrap {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
	justify-content: center;
}
.bar {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	background: var(--surface, #16181f);
	border: 1px solid rgba(201, 168, 76, 0.3);
	border-radius: 10px;
}
.query {
	font-size: 1rem;
}
.caret {
	width: 2px;
	height: 1.1em;
	background: rgba(201, 168, 76, 1);
	animation: blink 1s steps(2) infinite;
}
@keyframes blink {
	50% {
		opacity: 0;
	}
}
.filters {
	display: flex;
	gap: 0.5rem;
}
.chip {
	width: 28px;
	height: 28px;
	display: grid;
	place-items: center;
	border-radius: 50%;
	border: 1px solid var(--border, #2a2d36);
	opacity: 0.4;
	transition: all 0.3s;
}
.chipOn {
	opacity: 1;
	background: #d33;
	color: #fff;
	border-color: #d33;
}
.results {
	position: relative;
	display: flex;
	gap: 0.75rem;
	justify-content: center;
	align-items: center;
	flex: 1;
}
.card {
	width: 40%;
	max-width: 180px;
	will-change: transform, opacity;
}
.card :global(img) {
	width: 100%;
	height: auto;
	border-radius: 8px;
}
```

- [ ] **Step 3: Runtime verify (progress scrub)**

Temporarily mount `<SearchDemo progress={X} />` in `page.tsx` for `X = 0, 0.5, 1`. In `npm run dev` confirm: at 0 empty bar/no cards; at 0.5 partial query + filter on + cards appearing; at 1 full query, all 3 cards, hero lifted. Revert the temporary mount.

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx"`
Expected: no errors on this file.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/demos/SearchDemo/"
git add "src/app/[locale]/(landing)/components/demos/SearchDemo/"
git commit -m "feat(landing): SearchDemo scroll-driven demo"
```

---

## Task 5: `CollectionDemo`

**Files:**

- Create: `src/app/[locale]/(landing)/components/demos/CollectionDemo/CollectionDemo.tsx`
- Create: `src/app/[locale]/(landing)/components/demos/CollectionDemo/CollectionDemo.module.css`

**Interfaces:**

- Consumes: `COLLECTION_CARDS`, `COLLECTION_TARGET` (Task 3); Scryfall loader.
- Produces: `export function CollectionDemo({ progress }: { progress: number }): JSX.Element;`
- Beats: 0–0.4 grid fills card-by-card; 0.3–0.6 counter interpolates `0 → COLLECTION_TARGET`; 0.5–0.75 one card flips wishlist→owned (gold check overlay fades in); 0.75–1 phone+laptop glyphs connect with a drawn line, same card on both.

- [ ] **Step 1: Write the component** (reuse the `seg` helper pattern from Task 4 — repeat it inline)

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLLECTION_CARDS, COLLECTION_TARGET } from '@/app/[locale]/(landing)/data/demoContent';
import styles from './CollectionDemo.module.css';

function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

export function CollectionDemo({ progress }: { progress: number }) {
	const fill = seg(progress, 0, 0.4);
	const count = Math.round(seg(progress, 0.3, 0.6) * COLLECTION_TARGET);
	const owned = seg(progress, 0.5, 0.75);
	const sync = seg(progress, 0.75, 1);
	const revealCount = Math.round(fill * COLLECTION_CARDS.length);

	return (
		<div className={styles.wrap}>
			<div className={styles.counter}>{count.toLocaleString()}</div>
			<div className={styles.grid}>
				{COLLECTION_CARDS.map((card, i) => (
					<div key={i} className={styles.cell} style={{ opacity: i < revealCount ? 1 : 0.05 }}>
						<Image
							src={card.src}
							alt={card.name}
							width={122}
							height={170}
							loader={scryfallImageLoader}
							unoptimized={isScryfallImageUrl(card.src)}
							sizes="90px"
						/>
						{i === 4 ? (
							<span className={styles.check} style={{ opacity: owned }}>
								✓
							</span>
						) : null}
					</div>
				))}
			</div>
			<div className={styles.sync} style={{ opacity: sync }}>
				<span className={styles.device}>▢</span>
				<span className={styles.wire} style={{ transform: `scaleX(${sync})` }} />
				<span className={styles.device}>▭</span>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS module**

```css
.wrap {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
	justify-content: center;
	align-items: center;
}
.counter {
	font-size: 2rem;
	font-variant-numeric: tabular-nums;
	color: rgba(201, 168, 76, 1);
}
.grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.5rem;
	width: 100%;
	max-width: 300px;
}
.cell {
	position: relative;
	transition: opacity 0.3s;
}
.cell :global(img) {
	width: 100%;
	height: auto;
	border-radius: 5px;
}
.check {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: rgba(201, 168, 76, 0.35);
	color: #fff;
	font-size: 1.5rem;
	border-radius: 5px;
}
.sync {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.wire {
	width: 40px;
	height: 2px;
	background: rgba(201, 168, 76, 1);
	transform-origin: left;
}
.device {
	font-size: 1.5rem;
}
```

- [ ] **Step 3: Runtime verify (progress scrub 0 / 0.5 / 1)** — as in Task 4 Step 3.

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/demos/CollectionDemo/CollectionDemo.tsx"`

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/demos/CollectionDemo/"
git add "src/app/[locale]/(landing)/components/demos/CollectionDemo/"
git commit -m "feat(landing): CollectionDemo scroll-driven demo"
```

---

## Task 6: `DeckDemo`

**Files:**

- Create: `src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx`
- Create: `src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.module.css`

**Interfaces:**

- Consumes: `MANA_CURVE`, `COLOR_SLICES`, `HAND_CARDS` (Task 3); Scryfall loader.
- Produces: `export function DeckDemo({ progress }: { progress: number }): JSX.Element;`
- Beats: 0–0.3 cards stack; 0.3–0.6 mana-curve bars grow (per-bar height staggered); 0.5–0.75 color ring fills (conic-gradient sweep); 0.75–1 seven-card hand fans out.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLOR_SLICES, HAND_CARDS, MANA_CURVE } from '@/app/[locale]/(landing)/data/demoContent';
import styles from './DeckDemo.module.css';

function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

export function DeckDemo({ progress }: { progress: number }) {
	const bars = seg(progress, 0.3, 0.6);
	const ring = seg(progress, 0.5, 0.75);
	const fan = seg(progress, 0.75, 1);
	const maxBar = Math.max(...MANA_CURVE);

	// Build a conic-gradient string filled up to `ring` of the circle.
	let acc = 0;
	const stops = COLOR_SLICES.map((s) => {
		const start = acc;
		acc += s.pct;
		return `${s.color} ${start}% ${acc}%`;
	}).join(', ');

	return (
		<div className={styles.wrap}>
			<div className={styles.chart}>
				<div className={styles.bars}>
					{MANA_CURVE.map((v, i) => {
						const local = Math.min(1, Math.max(0, bars * MANA_CURVE.length - i));
						return (
							<span
								key={i}
								className={styles.bar}
								style={{ height: `${(v / maxBar) * 100 * local}%` }}
							/>
						);
					})}
				</div>
				<div
					className={styles.ring}
					style={{
						background: `conic-gradient(${stops}, transparent ${ring * 100}% 100%)`,
					}}
				/>
			</div>
			<div className={styles.hand}>
				{HAND_CARDS.map((card, i) => {
					const mid = (HAND_CARDS.length - 1) / 2;
					const angle = (i - mid) * 8 * fan;
					const y = Math.abs(i - mid) * 10 * fan;
					return (
						<div
							key={i}
							className={styles.handCard}
							style={{ transform: `rotate(${angle}deg) translateY(${y}px)`, opacity: fan }}
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
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS module**

```css
.wrap {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	justify-content: center;
	align-items: center;
}
.chart {
	display: flex;
	gap: 2rem;
	align-items: flex-end;
}
.bars {
	display: flex;
	align-items: flex-end;
	gap: 6px;
	height: 120px;
}
.bar {
	width: 16px;
	background: rgba(201, 168, 76, 0.85);
	border-radius: 3px 3px 0 0;
	transition: height 0.1s linear;
}
.ring {
	width: 96px;
	height: 96px;
	border-radius: 50%;
	mask: radial-gradient(transparent 52%, #000 53%);
	-webkit-mask: radial-gradient(transparent 52%, #000 53%);
}
.hand {
	display: flex;
	justify-content: center;
	align-items: flex-end;
	height: 150px;
}
.handCard {
	margin: 0 -18px;
	transform-origin: bottom center;
}
.handCard :global(img) {
	width: 70px;
	height: auto;
	border-radius: 5px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 3: Runtime verify (progress scrub 0 / 0.5 / 1).**

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/demos/DeckDemo/DeckDemo.tsx"`

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/demos/DeckDemo/"
git add "src/app/[locale]/(landing)/components/demos/DeckDemo/"
git commit -m "feat(landing): DeckDemo scroll-driven demo"
```

---

## Task 7: `ImportDemo`

**Files:**

- Create: `src/app/[locale]/(landing)/components/demos/ImportDemo/ImportDemo.tsx`
- Create: `src/app/[locale]/(landing)/components/demos/ImportDemo/ImportDemo.module.css`

**Interfaces:**

- Consumes: `IMPORT_SOURCES`, `IMPORT_RECOGNIZED`, `SEARCH_CARDS` (Task 3); Scryfall loader.
- Produces: `export function ImportDemo({ progress }: { progress: number }): JSX.Element;`
- Beats: 0–0.4 source name-chips drop toward a paste box (staggered translateY); 0.4–0.7 a pasted text block resolves into real cards (text fades out, cards fade in); 0.7–1 progress bar fills + "IMPORT_RECOGNIZED cartes reconnues".

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import {
	IMPORT_RECOGNIZED,
	IMPORT_SOURCES,
	SEARCH_CARDS,
} from '@/app/[locale]/(landing)/data/demoContent';
import styles from './ImportDemo.module.css';

function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

export function ImportDemo({ progress }: { progress: number }) {
	const drop = seg(progress, 0, 0.4);
	const resolve = seg(progress, 0.4, 0.7);
	const done = seg(progress, 0.7, 1);
	const recognized = Math.round(done * IMPORT_RECOGNIZED);

	return (
		<div className={styles.wrap}>
			<div className={styles.sources}>
				{IMPORT_SOURCES.map((s, i) => {
					const local = Math.min(1, Math.max(0, drop * IMPORT_SOURCES.length - i));
					return (
						<span
							key={s}
							className={styles.chip}
							style={{
								opacity: local,
								transform: `translateY(${(1 - local) * -20}px)`,
							}}
						>
							{s}
						</span>
					);
				})}
			</div>
			<div className={styles.box}>
				<pre className={styles.text} style={{ opacity: 1 - resolve }}>
					4 Lightning Bolt{'\n'}3 Goblin Guide{'\n'}2 Monastery Swiftspear
				</pre>
				<div className={styles.cards} style={{ opacity: resolve }}>
					{SEARCH_CARDS.map((c, i) => (
						<Image
							key={i}
							src={c.src}
							alt={c.name}
							width={80}
							height={112}
							loader={scryfallImageLoader}
							unoptimized={isScryfallImageUrl(c.src)}
							sizes="60px"
						/>
					))}
				</div>
			</div>
			<div className={styles.progress}>
				<span className={styles.fill} style={{ transform: `scaleX(${done})` }} />
			</div>
			<p className={styles.count} style={{ opacity: done }}>
				{recognized} cartes reconnues
			</p>
		</div>
	);
}
```

Note: the "cartes reconnues" label here is inside the demo mock; it is **not** localized copy (it is chrome text illustrating the app). Keep it short and neutral. The section's real localized copy (title/description) lives in `PinnedFeature` props.

- [ ] **Step 2: Write the CSS module**

```css
.wrap {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
	justify-content: center;
	align-items: center;
}
.sources {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
	justify-content: center;
}
.chip {
	padding: 0.35rem 0.7rem;
	border: 1px solid rgba(201, 168, 76, 0.4);
	border-radius: 999px;
	font-size: 0.8rem;
}
.box {
	position: relative;
	width: 100%;
	max-width: 280px;
	min-height: 120px;
	border: 1px dashed rgba(201, 168, 76, 0.4);
	border-radius: 10px;
	display: grid;
	place-items: center;
	padding: 1rem;
}
.text {
	position: absolute;
	font-size: 0.85rem;
	line-height: 1.5;
	color: var(--text-muted, #b9bcc4);
}
.cards {
	display: flex;
	gap: 0.4rem;
}
.cards :global(img) {
	width: 60px;
	height: auto;
	border-radius: 4px;
}
.progress {
	width: 100%;
	max-width: 280px;
	height: 6px;
	background: var(--border, #2a2d36);
	border-radius: 3px;
	overflow: hidden;
}
.fill {
	display: block;
	height: 100%;
	background: rgba(201, 168, 76, 1);
	transform-origin: left;
}
.count {
	font-size: 0.85rem;
	color: rgba(201, 168, 76, 1);
}
```

- [ ] **Step 3: Runtime verify (progress scrub 0 / 0.5 / 1).**

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/demos/ImportDemo/ImportDemo.tsx"`

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/demos/ImportDemo/"
git add "src/app/[locale]/(landing)/components/demos/ImportDemo/"
git commit -m "feat(landing): ImportDemo scroll-driven demo"
```

---

## Task 8: `PdfDemo`

**Files:**

- Create: `src/app/[locale]/(landing)/components/demos/PdfDemo/PdfDemo.tsx`
- Create: `src/app/[locale]/(landing)/components/demos/PdfDemo/PdfDemo.module.css`

**Interfaces:**

- Consumes: `COLLECTION_CARDS` (Task 3); Scryfall loader.
- Produces: `export function PdfDemo({ progress }: { progress: number }): JSX.Element;`
- Beats: 0–0.5 nine cards drop into a 3×3 print sheet (staggered); 0.5–0.8 the sheet "folds"/tilts into a PDF (perspective rotateX); 0.8–1 "prêt à imprimer" badge appears.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLLECTION_CARDS } from '@/app/[locale]/(landing)/data/demoContent';
import styles from './PdfDemo.module.css';

function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

export function PdfDemo({ progress }: { progress: number }) {
	const drop = seg(progress, 0, 0.5);
	const fold = seg(progress, 0.5, 0.8);
	const badge = seg(progress, 0.8, 1);
	const nine = COLLECTION_CARDS.slice(0, 9);

	return (
		<div className={styles.wrap}>
			<div
				className={styles.sheet}
				style={{ transform: `perspective(900px) rotateX(${fold * 35}deg)` }}
			>
				{nine.map((card, i) => {
					const local = Math.min(1, Math.max(0, drop * 9 - i));
					return (
						<div
							key={i}
							className={styles.cell}
							style={{ opacity: local, transform: `translateY(${(1 - local) * -16}px)` }}
						>
							<Image
								src={card.src}
								alt={card.name}
								width={80}
								height={112}
								loader={scryfallImageLoader}
								unoptimized={isScryfallImageUrl(card.src)}
								sizes="60px"
							/>
						</div>
					);
				})}
			</div>
			<span className={styles.badge} style={{ opacity: badge }}>
				PDF · prêt à imprimer
			</span>
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS module**

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
.sheet {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 6px;
	padding: 12px;
	background: #f4f1e8;
	border-radius: 6px;
	box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
	transform-origin: center bottom;
	transition: transform 0.1s linear;
}
.cell :global(img) {
	width: 100%;
	height: auto;
	border-radius: 3px;
	display: block;
}
.badge {
	padding: 0.4rem 0.9rem;
	border: 1px solid rgba(201, 168, 76, 0.6);
	border-radius: 999px;
	font-size: 0.8rem;
	color: rgba(201, 168, 76, 1);
}
```

- [ ] **Step 3: Runtime verify (progress scrub 0 / 0.5 / 1).**

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/demos/PdfDemo/PdfDemo.tsx"`

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/demos/PdfDemo/"
git add "src/app/[locale]/(landing)/components/demos/PdfDemo/"
git commit -m "feat(landing): PdfDemo scroll-driven demo"
```

---

## Task 9: `EditorDemo` (coming soon)

**Files:**

- Create: `src/app/[locale]/(landing)/components/demos/EditorDemo/EditorDemo.tsx`
- Create: `src/app/[locale]/(landing)/components/demos/EditorDemo/EditorDemo.module.css`

**Interfaces:**

- Consumes: nothing from data (pure mock frame).
- Produces: `export function EditorDemo({ progress }: { progress: number }): JSX.Element;`
- Beats (teaser, intentionally less finished): 0–0.4 blank card frame draws (border grows); 0.4–0.8 title + art zone + text appear as ghosts; 0.8–1 gold "Bientôt" stamp presses in (scale from 1.4→1 + opacity). **No route link** (handled by omitting `href` in `page.tsx`).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import styles from './EditorDemo.module.css';

function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

export function EditorDemo({ progress }: { progress: number }) {
	const frame = seg(progress, 0, 0.4);
	const ghost = seg(progress, 0.4, 0.8);
	const stamp = seg(progress, 0.8, 1);

	return (
		<div className={styles.wrap}>
			<div className={styles.card} style={{ borderColor: `rgba(201,168,76,${0.2 + frame * 0.6})` }}>
				<div className={styles.title} style={{ opacity: ghost }} />
				<div className={styles.art} style={{ opacity: ghost }} />
				<div className={styles.textLines} style={{ opacity: ghost }}>
					<span />
					<span />
					<span />
				</div>
				<span
					className={styles.stamp}
					style={{ opacity: stamp, transform: `scale(${1.4 - stamp * 0.4}) rotate(-12deg)` }}
				>
					Bientôt
				</span>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS module**

```css
.wrap {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
}
.card {
	position: relative;
	width: 220px;
	height: 308px;
	border: 2px solid rgba(201, 168, 76, 0.2);
	border-radius: 12px;
	padding: 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	background: rgba(255, 255, 255, 0.02);
}
.title {
	height: 18px;
	border-radius: 4px;
	background: rgba(201, 168, 76, 0.25);
}
.art {
	flex: 1;
	border-radius: 6px;
	background: rgba(201, 168, 76, 0.12);
}
.textLines {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.textLines span {
	height: 8px;
	border-radius: 3px;
	background: rgba(255, 255, 255, 0.1);
}
.textLines span:nth-child(2) {
	width: 80%;
}
.textLines span:nth-child(3) {
	width: 60%;
}
.stamp {
	position: absolute;
	inset: 0;
	margin: auto;
	width: max-content;
	height: max-content;
	padding: 0.3rem 1rem;
	border: 3px solid rgba(201, 168, 76, 0.9);
	border-radius: 8px;
	color: rgba(201, 168, 76, 1);
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}
```

- [ ] **Step 3: Runtime verify (progress scrub 0 / 0.5 / 1).**

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/demos/EditorDemo/EditorDemo.tsx"`

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/demos/EditorDemo/"
git add "src/app/[locale]/(landing)/components/demos/EditorDemo/"
git commit -m "feat(landing): EditorDemo coming-soon teaser demo"
```

---

## Task 10: Evolve the Hero

**Files:**

- Modify: `src/app/[locale]/(landing)/components/Hero/Hero.tsx`
- Modify: `src/app/[locale]/(landing)/components/Hero/Hero.module.css`

**Interfaces:**

- Consumes: `useTranslations('landing.hero')`, `useScrollProgress`, `useReducedMotion`, `BRAND_FONT_FAMILY`, `Button`, `Link`.
- Produces: `export function Hero(): JSX.Element;` (unchanged signature).

**Copy keys used (must exist in Task 12):** `landing.hero.tagline`, `landing.hero.description`, `landing.hero.explore`, `landing.hero.myCollection`.

- [ ] **Step 1: Rewrite `Hero.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { BRAND_FONT_FAMILY } from '@/fonts/brand';
import { useScrollProgress } from '@/app/[locale]/(landing)/hooks/useScrollProgress';
import { useReducedMotion } from '@/app/[locale]/(landing)/hooks/useReducedMotion';
import styles from './Hero.module.css';

export function Hero() {
	const t = useTranslations('landing.hero');
	const ref = useRef<HTMLElement>(null);
	const reduced = useReducedMotion();
	const p = useScrollProgress(ref);
	const shift = reduced ? 0 : p;

	return (
		<section ref={ref} className={styles.hero}>
			<div className={styles.veil} />
			<div className={styles.content}>
				<div className={styles.mark} style={{ transform: `translateY(${shift * -40}px)` }}>
					{/*
					 * Wordmark décoratif : le "W" négatif + le mot rendus avec la brand
					 * font. Le nom "Wizcard" et l'objectif restent énoncés visiblement
					 * dans la tagline ci-dessous (vérification de marque Google à l'œil).
					 */}
					<span className={styles.wGlyph} style={{ fontFamily: BRAND_FONT_FAMILY }}>
						W
					</span>
					<span className={styles.wordmark} style={{ fontFamily: BRAND_FONT_FAMILY }}>
						WIZCARD
					</span>
				</div>
				<div className={styles.titleRule} />
				<p className={styles.tagline}>{t('tagline')}</p>
				<p className={styles.description}>{t('description')}</p>
				<div className={styles.cta}>
					<Link href="/search">
						<Button size="lg">{t('explore')}</Button>
					</Link>
					<Link href="/collection">
						<Button variant="ghost" size="lg">
							{t('myCollection')}
						</Button>
					</Link>
				</div>
			</div>
			<div className={styles.scrollHint}>
				<span className={styles.scrollDiamond} />
				<span className={styles.scrollLine} />
			</div>
		</section>
	);
}
```

- [ ] **Step 2: Rewrite `Hero.module.css`** (lighter art-deco; `.veil` dims the global crosshatch behind the hero; remove old corner-frame / backdrop classes)

```css
.hero {
	position: relative;
	min-height: calc(100vh - var(--navbar-height));
	display: grid;
	place-items: center;
	text-align: center;
	overflow: hidden;
}
/* Dim the global fixed crosshatch behind the hero so the wordmark breathes. */
.veil {
	position: absolute;
	inset: 0;
	background: radial-gradient(120% 90% at 50% 40%, rgba(11, 12, 16, 0.9) 0%, transparent 70%);
	pointer-events: none;
}
.content {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
	padding: 2rem;
}
.mark {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	will-change: transform;
}
.wGlyph {
	font-size: clamp(5rem, 16vw, 11rem);
	line-height: 0.8;
	color: rgba(201, 168, 76, 1);
}
.wordmark {
	font-size: clamp(1.5rem, 5vw, 3rem);
	letter-spacing: 0.3em;
	color: var(--foreground);
}
.titleRule {
	width: 120px;
	height: 1px;
	background: linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.8), transparent);
}
.tagline {
	font-size: clamp(1.1rem, 2.4vw, 1.6rem);
	max-width: 40ch;
}
.description {
	color: var(--text-muted, #b9bcc4);
	max-width: 46ch;
	line-height: 1.6;
}
.cta {
	display: flex;
	gap: 1rem;
	margin-top: 1rem;
	flex-wrap: wrap;
	justify-content: center;
}
.scrollHint {
	position: absolute;
	bottom: 2rem;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}
.scrollDiamond {
	width: 8px;
	height: 8px;
	background: rgba(201, 168, 76, 1);
	transform: rotate(45deg);
}
.scrollLine {
	width: 1px;
	height: 40px;
	background: linear-gradient(rgba(201, 168, 76, 0.8), transparent);
}
@media (prefers-reduced-motion: reduce) {
	.mark {
		transform: none !important;
	}
}
```

- [ ] **Step 3: Runtime verify** — `npm run dev`, `/` shows the negative W + wordmark + tagline + two CTAs; the mark parallax-shifts slightly on scroll (desktop) and is static under reduced-motion.

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/Hero/Hero.tsx"`
(Note: `t('explore')` etc. will only resolve at runtime once Task 12 adds keys; tsc does not check that.)

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/Hero/"
git add "src/app/[locale]/(landing)/components/Hero/"
git commit -m "feat(landing): evolve hero — negative W, lighter art-deco, micro-parallax"
```

---

## Task 11: `FinalCTA`

**Files:**

- Create: `src/app/[locale]/(landing)/components/FinalCTA/FinalCTA.tsx`
- Create: `src/app/[locale]/(landing)/components/FinalCTA/FinalCTA.module.css`

**Interfaces:**

- Consumes: `useTranslations('landing.finalCta')`, `Button`, `Link`, `BRAND_FONT_FAMILY`.
- Produces: `export function FinalCTA(): JSX.Element;`
- Copy keys (Task 12): `landing.finalCta.title`, `landing.finalCta.start`, `landing.finalCta.publicDecks`.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { BRAND_FONT_FAMILY } from '@/fonts/brand';
import styles from './FinalCTA.module.css';

export function FinalCTA() {
	const t = useTranslations('landing.finalCta');
	return (
		<section className={styles.section}>
			<span className={styles.w} style={{ fontFamily: BRAND_FONT_FAMILY }}>
				W
			</span>
			<div className={styles.diamond} />
			<h2 className={styles.title}>{t('title')}</h2>
			<div className={styles.cta}>
				<Link href="/search">
					<Button size="lg">{t('start')}</Button>
				</Link>
				<Link href="/decks">
					<Button variant="ghost" size="lg">
						{t('publicDecks')}
					</Button>
				</Link>
			</div>
		</section>
	);
}
```

- [ ] **Step 2: Write the CSS module**

```css
.section {
	position: relative;
	min-height: 90vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1.5rem;
	text-align: center;
	padding: 4rem 2rem;
}
.w {
	font-size: clamp(3rem, 10vw, 6rem);
	color: rgba(201, 168, 76, 0.9);
	line-height: 0.8;
}
.diamond {
	width: 10px;
	height: 10px;
	background: rgba(201, 168, 76, 1);
	transform: rotate(45deg);
}
.title {
	font-size: clamp(1.8rem, 5vw, 3rem);
	max-width: 20ch;
}
.cta {
	display: flex;
	gap: 1rem;
	flex-wrap: wrap;
	justify-content: center;
}
```

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/components/FinalCTA/FinalCTA.tsx"`

- [ ] **Step 4: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/components/FinalCTA/"
git add "src/app/[locale]/(landing)/components/FinalCTA/"
git commit -m "feat(landing): final CTA section"
```

---

## Task 12: Rewrite i18n `landing.*` namespace (fr + en)

**Files:**

- Modify: `messages/fr.json` (`landing` key)
- Modify: `messages/en.json` (`landing` key)

**Interfaces:**

- Produces the keys consumed by Hero (Task 10), FinalCTA (Task 11), and `page.tsx` (Task 13). Shape:

  ```
  landing.hero.{tagline, description, explore, myCollection}
  landing.discover                                  // "Découvrir" link label, shared
  landing.badge.soon                                // "Bientôt" / "Coming soon"
  landing.features.{search,collection,deck,import,pdf,editor}.{label,title,description}
  landing.finalCta.{title, start, publicDecks}
  ```

- [ ] **Step 1: Replace the `landing` block in `messages/fr.json`**

```json
"landing": {
  "hero": {
    "tagline": "Votre compagnon complet pour Magic: The Gathering.",
    "description": "Cherchez, collectionnez et construisez — chaque carte jamais imprimée, au même endroit.",
    "explore": "Explorer",
    "myCollection": "Ma collection"
  },
  "discover": "Découvrir",
  "badge": { "soon": "Bientôt" },
  "features": {
    "search": {
      "label": "Recherche",
      "title": "Cartes, decks et joueurs — une seule barre",
      "description": "Une recherche multi-entités instantanée, avec des filtres Scryfall avancés : couleurs, types, coût de mana."
    },
    "collection": {
      "label": "Collection",
      "title": "Votre collection vous suit partout",
      "description": "Suivez chaque carte, votre wishlist et vos exports. Synchronisation cloud sur tous vos appareils."
    },
    "deck": {
      "label": "Deckbuilding",
      "title": "Construisez, analysez, testez",
      "description": "Courbe de mana, manabase, distribution des types et main de départ — tout pour affiner vos decks."
    },
    "import": {
      "label": "Import",
      "title": "Arrivez avec ce que vous avez déjà",
      "description": "Importez depuis Moxfield, MTG Arena, CardNexus ou Delver Lens en un seul coller."
    },
    "pdf": {
      "label": "Export PDF",
      "title": "Vos cartes en planches prêtes à imprimer",
      "description": "Générez des planches proxy propres, prêtes pour l'impression, en quelques clics."
    },
    "editor": {
      "label": "Éditeur de cartes",
      "title": "Créez vos propres cartes",
      "description": "Un éditeur de cartes personnalisées arrive bientôt. Restez à l'affût."
    }
  },
  "finalCta": {
    "title": "Prêt à explorer ?",
    "start": "Commencer",
    "publicDecks": "Voir les decks publics"
  }
}
```

- [ ] **Step 2: Replace the `landing` block in `messages/en.json`**

```json
"landing": {
  "hero": {
    "tagline": "Your complete Magic: The Gathering companion.",
    "description": "Search, collect, and build — every card ever printed, all in one place.",
    "explore": "Explore",
    "myCollection": "My Collection"
  },
  "discover": "Discover",
  "badge": { "soon": "Coming soon" },
  "features": {
    "search": {
      "label": "Search",
      "title": "Cards, decks and players — one bar",
      "description": "Instant multi-entity search with advanced Scryfall filters: colors, types, mana cost."
    },
    "collection": {
      "label": "Collection",
      "title": "Your collection follows you everywhere",
      "description": "Track every card, your wishlist and exports. Cloud sync across all your devices."
    },
    "deck": {
      "label": "Deckbuilding",
      "title": "Build, analyze, test",
      "description": "Mana curve, manabase, type distribution and opening hand — everything to refine your decks."
    },
    "import": {
      "label": "Import",
      "title": "Bring what you already have",
      "description": "Import from Moxfield, MTG Arena, CardNexus or Delver Lens in a single paste."
    },
    "pdf": {
      "label": "PDF export",
      "title": "Your cards as print-ready sheets",
      "description": "Generate clean, print-ready proxy sheets in a few clicks."
    },
    "editor": {
      "label": "Card editor",
      "title": "Create your own cards",
      "description": "A custom card editor is coming soon. Stay tuned."
    }
  },
  "finalCta": {
    "title": "Ready to explore?",
    "start": "Get started",
    "publicDecks": "Browse public decks"
  }
}
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "require('./messages/fr.json'); require('./messages/en.json'); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
npx prettier --write messages/fr.json messages/en.json
git add messages/fr.json messages/en.json
git commit -m "i18n(landing): rewrite landing namespace for cinematic rework"
```

---

## Task 13: Orchestrate `page.tsx` + wire everything

**Files:**

- Modify: `src/app/[locale]/(landing)/page.tsx`
- Modify: `src/app/[locale]/(landing)/page.module.css`

**Interfaces:**

- Consumes: `Hero`, `PinnedFeature`, all six demos, `FinalCTA`, `getTranslations`. Because `PinnedFeature` and demos are client components but need localized strings, pass strings as props resolved server-side via `getTranslations`, OR render a small `'use client'` wrapper that calls `useTranslations`. **Chosen approach:** a client wrapper `FeatureSections` that uses `useTranslations('landing')` and renders the six `PinnedFeature`s — keeps `page.tsx` a server component for metadata.
- Create: `src/app/[locale]/(landing)/components/FeatureSections.tsx` (client).

- [ ] **Step 1: Create `FeatureSections.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { PinnedFeature } from './PinnedFeature/PinnedFeature';
import { SearchDemo } from './demos/SearchDemo/SearchDemo';

const CollectionDemo = dynamic(() =>
	import('./demos/CollectionDemo/CollectionDemo').then((m) => m.CollectionDemo)
);
const DeckDemo = dynamic(() => import('./demos/DeckDemo/DeckDemo').then((m) => m.DeckDemo));
const ImportDemo = dynamic(() => import('./demos/ImportDemo/ImportDemo').then((m) => m.ImportDemo));
const PdfDemo = dynamic(() => import('./demos/PdfDemo/PdfDemo').then((m) => m.PdfDemo));
const EditorDemo = dynamic(() => import('./demos/EditorDemo/EditorDemo').then((m) => m.EditorDemo));

export function FeatureSections() {
	const t = useTranslations('landing');
	const discover = t('discover');
	return (
		<>
			<PinnedFeature
				index={1}
				side="left"
				label={t('features.search.label')}
				title={t('features.search.title')}
				description={t('features.search.description')}
				href="/search"
				linkLabel={discover}
				renderDemo={(p) => <SearchDemo progress={p} />}
			/>
			<PinnedFeature
				index={2}
				side="right"
				label={t('features.collection.label')}
				title={t('features.collection.title')}
				description={t('features.collection.description')}
				href="/collection"
				linkLabel={discover}
				renderDemo={(p) => <CollectionDemo progress={p} />}
			/>
			<PinnedFeature
				index={3}
				side="left"
				label={t('features.deck.label')}
				title={t('features.deck.title')}
				description={t('features.deck.description')}
				href="/decks"
				linkLabel={discover}
				renderDemo={(p) => <DeckDemo progress={p} />}
			/>
			<PinnedFeature
				index={4}
				side="right"
				label={t('features.import.label')}
				title={t('features.import.title')}
				description={t('features.import.description')}
				href="/collection"
				linkLabel={discover}
				renderDemo={(p) => <ImportDemo progress={p} />}
			/>
			<PinnedFeature
				index={5}
				side="left"
				label={t('features.pdf.label')}
				title={t('features.pdf.title')}
				description={t('features.pdf.description')}
				href="/decks"
				linkLabel={discover}
				renderDemo={(p) => <PdfDemo progress={p} />}
			/>
			<PinnedFeature
				index={6}
				side="right"
				label={t('features.editor.label')}
				title={t('features.editor.title')}
				description={t('features.editor.description')}
				badge={t('badge.soon')}
				renderDemo={(p) => <EditorDemo progress={p} />}
			/>
		</>
	);
}
```

- [ ] **Step 2: Rewrite `page.tsx`** (keep metadata; swap body)

```tsx
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { Hero } from './components/Hero/Hero';
import { FeatureSections } from './components/FeatureSections';
import { FinalCTA } from './components/FinalCTA/FinalCTA';
import styles from './page.module.css';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.home' });
	return {
		title: { absolute: t('title') },
		description: t('description'),
		alternates: buildAlternates(locale),
	};
}

export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
	const { locale } = await params;
	setRequestLocale(locale);
	return (
		<div className={styles.page}>
			<Hero />
			<FeatureSections />
			<FinalCTA />
		</div>
	);
}
```

- [ ] **Step 3: Ensure `page.module.css` has a `.page` wrapper**

```css
.page {
	position: relative;
}
```

- [ ] **Step 4: Full runtime verify**

Run `npm run dev`, load `/fr` and `/en`:

- Hero renders; scrolling plays each of the six pinned demos in order (Search→Collection→Deck→Import→PDF→Editor), text alternates sides.
- Each "Découvrir/Discover" link points to the right route; Editor has **no** link and shows the Soon badge.
- FinalCTA at the bottom with two buttons.
- Resize < 768px: no pinning, each demo shows its final state, page scrolls normally.
- DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: same static behavior.

- [ ] **Step 5: Verify types + lint (changed files)**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/(landing)/page.tsx" "src/app/[locale]/(landing)/components/FeatureSections.tsx"`

- [ ] **Step 6: Commit**

```bash
npx prettier --write "src/app/[locale]/(landing)/page.tsx" "src/app/[locale]/(landing)/page.module.css" "src/app/[locale]/(landing)/components/FeatureSections.tsx"
git add "src/app/[locale]/(landing)/page.tsx" "src/app/[locale]/(landing)/page.module.css" "src/app/[locale]/(landing)/components/FeatureSections.tsx"
git commit -m "feat(landing): orchestrate cinematic sections in page"
```

---

## Task 14: Remove obsolete components + final gate

**Files:**

- Delete: `src/app/[locale]/(landing)/components/Features/` (Features.tsx + .module.css)
- Delete: `src/app/[locale]/(landing)/components/CardShowcase/` (CardShowcase.tsx + .module.css + showcaseData.ts)
- Delete: `src/app/[locale]/(landing)/components/CallToAction/` (CallToAction.tsx + .module.css)
- Delete: `src/app/[locale]/(landing)/components/Hero/backdrops/` (all backdrops + RandomBackdrop)

- [ ] **Step 1: Confirm nothing else imports them**

Run: `grep -rn "CardShowcase\|CallToAction\|components/Features\|backdrops/\|showcaseData" src/ | grep -v "src/app/\[locale\]/(landing)/components/\(Features\|CardShowcase\|CallToAction\|Hero/backdrops\)"`
Expected: no output (only the files being deleted reference each other). If `Features`/`showcase`/`cta` i18n keys are referenced anywhere else, stop and investigate.

- [ ] **Step 2: Delete the directories**

```bash
git rm -r "src/app/[locale]/(landing)/components/Features" \
  "src/app/[locale]/(landing)/components/CardShowcase" \
  "src/app/[locale]/(landing)/components/CallToAction" \
  "src/app/[locale]/(landing)/components/Hero/backdrops"
```

- [ ] **Step 3: Confirm no orphaned i18n keys remain**

The old `landing.features.instantSearch`, `landing.showcase`, `landing.cta` keys were fully replaced in Task 12 (the whole `landing` block was rewritten), so nothing to purge. Verify:
Run: `grep -n "instantSearch\|advancedFilters\|legendaryStaples\|\"showcase\"\|\"cta\"" messages/fr.json messages/en.json`
Expected: no output.

- [ ] **Step 4: Full project check**

Run: `npm run check`
Expected: no **new** problems in `src/app/[locale]/(landing)/**` or `messages/**` (baseline is red elsewhere — compare against the pre-existing ~60 problems; the landing/messages files must contribute zero).

- [ ] **Step 5: Production build sanity**

Run: `npm run build`
Expected: build succeeds; `/[locale]` route compiles. (Catches any SSR/`'use client'` boundary or dynamic-import issue the dev server tolerates.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(landing): remove obsolete landing components"
```

---

## Self-Review

**Spec coverage:** Hero evolution → Task 10; 6 pinned feature screens with per-`progress` beats → Tasks 4–9 + shell Task 2; semi-real Scryfall imagery + fixed data → Task 3; PinnedFeature + progress pattern → Task 2; mobile/reduced-motion degradation → Tasks 1–2; FinalCTA + brand loop → Task 11; i18n fr+en rewrite + purge → Tasks 12 & 14; SEO metadata preserved → Task 13; removal of old components → Task 14. Out-of-scope items (progress-rail, "notify me") correctly absent. **All spec sections covered.**

**Placeholder scan:** One intentional placeholder token (`replace-me` Scryfall URL) is explicitly gated by Task 3 Step 2–3 (must be resolved, grep asserts absence before commit). No other TBD/TODO. Chart/hand data uses concrete numbers.

**Type consistency:** All demos share the signature `({ progress }: { progress: number })`. `PinnedFeature.renderDemo: (progress: number) => ReactNode` matches every `renderDemo={(p) => <XDemo progress={p} />}` call in Task 13. The `seg(p,a,b)` helper is repeated inline per demo (deliberate — no shared util, keeps each demo self-contained; acceptable small duplication). i18n keys consumed in Tasks 10/11/13 all exist in Task 12's shape.

**Note on `seg` duplication:** repeated inline in 6 demos + could be a `data/`-level util. Left inline per YAGNI/isolation (each demo stays self-contained and independently testable). If a reviewer prefers, extract to `hooks/`—not required.
