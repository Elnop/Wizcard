# SearchDemo Multi-Entity Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the landing "Search" demo so it animates all three real search entities (Cards → Decks → Profiles) with a tab switcher and mini DeckCard/ProfileCard mocks, matching the section copy and the real `/search` page.

**Architecture:** A single client component `SearchDemo` renders persistent chrome (search bar + tab bar) and, driven by scroll `progress` (0→1), morphs through three beats. Each beat activates one tab, retypes the query, and rises in that entity's mock results. Mock DeckCard/ProfileCard are small self-contained subcomponents in the same file (not the real components — those pull next-intl/dnd-kit/links). All data is static in `demoContent.ts`; no runtime fetch, no new deps.

**Tech Stack:** Next.js (App Router), React client component, CSS Modules, `next/image` via `scryfallImageLoader`, `next-intl` labels forwarded as props.

## Global Constraints

- No runtime fetch — landing renders deterministically and offline; all data static in `demoContent.ts`.
- No new dependencies.
- Do NOT import the real `DeckCard` / `ProfileCard` (they pull next-intl, dnd-kit, tilt, links).
- Scryfall images MUST go through `scryfallImageLoader` with `unoptimized={isScryfallImageUrl(src)}` (default UA is blocked on cards.scryfall.io — see memory `project_scryfall_image_ua_block`).
- No test framework (memory `project_no_test_framework`): verify via `npx eslint <changed files>`, `npm run build`, and runtime `npm run dev`. Gate on **no NEW** eslint problems — `npm run check` baseline is RED (memory `project_check_red_baseline`).
- Timing uses the shared `seg(p, a, b)` util (`(landing)/utils/seg.ts`).
- Tab labels + profile type line come from the existing `search` namespace keys: `entityCards`, `entityDecks`, `entityProfiles`, `profileTypeLine` (present in `en.json` and `fr.json`).
- Static/reduced-motion must rest on the **Cards** beat, with all three tabs visible. NOTE: `useScrollProgress` clamps to exactly `1` during normal scroll too (`Math.min(1, …)`), so `progress === 1` is NOT a reliable static signal — `PinnedFeature` must pass an explicit `isStatic` flag to the demo.

---

## File Structure

- `src/app/[locale]/(landing)/data/demoContent.ts` — **modify**: add `DemoDeckResult`, `SEARCH_DECKS`, `DemoProfileResult`, `SEARCH_PROFILES`.
- `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx` — **rewrite**: chrome + beats + mock subcomponents.
- `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.module.css` — **rewrite**: tab bar, mini deck card, mini profile card, results morph.
- `src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.tsx` — **modify**: widen `renderDemo` to `(progress, isStatic)`.
- `src/app/[locale]/(landing)/components/FeatureSections.tsx` — **modify**: forward `search` labels + `isStatic` to `SearchDemo`.

---

## Task 1: Static mock data for decks & profiles

**Files:**

- Modify: `src/app/[locale]/(landing)/data/demoContent.ts`

**Interfaces:**

- Consumes: nothing (self-contained data).
- Produces:
  - `interface DemoDeckResult { name: string; format: string; artCropSrc: string; colors: string[] }`
  - `const SEARCH_DECKS: DemoDeckResult[]` (2 entries)
  - `interface DemoProfileResult { nickname: string; avatarSrc?: string; deckCount: number; cardCount: number }`
  - `const SEARCH_PROFILES: DemoProfileResult[]` (2 entries)

- [ ] **Step 1: Append the deck-result data.** Add at the end of `demoContent.ts` (after `IMPORT_RECOGNIZED`). The `artCropSrc` URLs are the `/art_crop/` variants of IDs already verified in this file (Bloodbraid Elf → Gruul aggro cover; Glorybringer → mono-R burn cover), so no new verification is needed.

```ts
// ── Deck search results (landing SearchDemo, Decks beat) ──────────────────
// art_crop variants of IDs already verified above (same host/path, /art_crop/).
export interface DemoDeckResult {
	name: string;
	format: string; // shown in the format pill
	artCropSrc: string;
	colors: string[]; // WUBRG letters → color pips
}

export const SEARCH_DECKS: DemoDeckResult[] = [
	{
		name: 'Gruul Aggro',
		format: 'Modern',
		artCropSrc:
			'https://cards.scryfall.io/art_crop/front/e/2/e2f12f6f-9383-47e6-a44f-2834ad130e51.jpg',
		colors: ['R', 'G'],
	},
	{
		name: 'Mono-Red Burn',
		format: 'Pioneer',
		artCropSrc:
			'https://cards.scryfall.io/art_crop/front/0/6/06f90d62-6d21-47b1-a427-eb25a42f4dcb.jpg',
		colors: ['R'],
	},
];

// ── Profile search results (landing SearchDemo, Profiles beat) ────────────
// No real user avatars to embed → both render the ghost silhouette fallback.
export interface DemoProfileResult {
	nickname: string;
	avatarSrc?: string; // omitted → ghost silhouette
	deckCount: number;
	cardCount: number;
}

export const SEARCH_PROFILES: DemoProfileResult[] = [
	{ nickname: 'planeswalker42', deckCount: 12, cardCount: 1840 },
	{ nickname: 'goblin_king', deckCount: 5, cardCount: 623 },
];
```

- [ ] **Step 2: Lint the changed file.**

Run: `npx eslint "src/app/[locale]/(landing)/data/demoContent.ts"`
Expected: no NEW problems (compare against baseline: run the same command on `origin/main:` version if unsure; file was clean before this edit).

- [ ] **Step 3: Commit.**

```bash
git add "src/app/[locale]/(landing)/data/demoContent.ts"
git commit -m "feat(landing): add SearchDemo deck & profile mock data

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite SearchDemo component (beats + chrome + mocks)

**Files:**

- Rewrite: `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx`

**Interfaces:**

- Consumes: `SEARCH_CARDS`, `SEARCH_DECKS`, `SEARCH_PROFILES` (Task 1) from `demoContent`; `seg` util; `scryfallImageLoader`/`isScryfallImageUrl`.
- Produces: `SearchDemo` now takes props:

  ```ts
  interface SearchDemoLabels {
  	cards: string;
  	decks: string;
  	profiles: string;
  	profileType: string;
  }
  function SearchDemo({
  	progress,
  	isStatic,
  	labels,
  }: {
  	progress: number;
  	isStatic: boolean;
  	labels: SearchDemoLabels;
  }): JSX.Element;
  ```

  `isStatic` comes from `PinnedFeature` (reduced-motion/mobile). It is NOT derived from `progress` — see Global Constraints note. Task 2 writes `SearchDemo` accepting `isStatic` and threads it through; the actual branching logic is finalized in Task 5.

- [ ] **Step 1: Replace the whole file** with the version below. Timing: three beats (`0–0.36` cards, `0.36–0.68` decks, `0.68–1` profiles). `activeTab` is derived once from `progress` and drives both the tab highlight and which results render. Each beat has a query that types out over its first ~0.1 and results that rise in. CSS class names referenced here are created in Task 3.

```tsx
'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import {
	SEARCH_CARDS,
	SEARCH_DECKS,
	SEARCH_PROFILES,
	type DemoProfileResult,
	type DemoDeckResult,
} from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './SearchDemo.module.css';

export interface SearchDemoLabels {
	cards: string;
	decks: string;
	profiles: string;
	profileType: string;
}

// Beat boundaries on progress (0..1). Each beat: one active tab + its results.
const BEATS = [
	{ start: 0, query: 'Lightning Bolt' },
	{ start: 0.36, query: 'Gruul aggro' },
	{ start: 0.68, query: '@planeswalker' },
] as const;

/** Which beat progress currently sits in → active tab index (0|1|2). */
function activeBeat(progress: number): 0 | 1 | 2 {
	if (progress >= BEATS[2].start) return 2;
	if (progress >= BEATS[1].start) return 1;
	return 0;
}

const COLOR_PIP_HEX: Record<string, string> = {
	W: '#e9e4d0',
	U: '#3b7dd8',
	B: '#31313a',
	R: '#d84a3a',
	G: '#4a9c5d',
};

/** WUBRG dots overlaid on a deck cover, mirroring DeckCard's color pips. */
function ColorPips({ colors }: { colors: string[] }) {
	return (
		<div className={styles.pips}>
			{colors.map((c) => (
				<span key={c} className={styles.pip} style={{ background: COLOR_PIP_HEX[c] ?? '#555' }} />
			))}
		</div>
	);
}

/** Mini DeckCard: cover art-crop + scrim + name + format pill + color pips. */
function MiniDeckCard({ deck }: { deck: DemoDeckResult }) {
	return (
		<div className={styles.deckCard}>
			<Image
				className={styles.deckArt}
				src={deck.artCropSrc}
				alt={deck.name}
				width={244}
				height={170}
				loader={scryfallImageLoader}
				unoptimized={isScryfallImageUrl(deck.artCropSrc)}
				sizes="200px"
			/>
			<div className={styles.deckScrim} />
			<ColorPips colors={deck.colors} />
			<div className={styles.deckMeta}>
				<span className={styles.deckName}>{deck.name}</span>
				<span className={styles.deckFormat}>{deck.format}</span>
			</div>
		</div>
	);
}

/** Phantom silhouette shown when a profile has no avatar (matches ProfileCard). */
function GhostAvatar() {
	return (
		<svg className={styles.ghost} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="8" r="4" fill="currentColor" />
			<path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor" />
		</svg>
	);
}

function DeckGlyph() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2.5" y="2" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path
				d="M5.5 4.5h4M13 4.5v9a1 1 0 0 1-1 1H6"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CardsGlyph() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2" y="3" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path d="M5 5.5h3M5 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

/** Mini ProfileCard: 63/88 frame, nickname bar, avatar/ghost art, type line, PT badge. */
function MiniProfileCard({
	profile,
	typeLabel,
}: {
	profile: DemoProfileResult;
	typeLabel: string;
}) {
	return (
		<div className={styles.profileCard}>
			<div className={styles.profileTitleBar}>
				<span className={styles.profileNick}>{profile.nickname}</span>
			</div>
			<div className={styles.profileArt}>
				{profile.avatarSrc ? (
					// eslint-disable-next-line @next/next/no-img-element -- static demo, Supabase host not whitelisted
					<img src={profile.avatarSrc} alt="" className={styles.profileArtImg} />
				) : (
					<GhostAvatar />
				)}
			</div>
			<div className={styles.profileType}>{typeLabel}</div>
			<div className={styles.profileText}>
				<div className={styles.profileBadge}>
					<span className={styles.profileStat}>
						<DeckGlyph />
						{profile.deckCount}
					</span>
					<span className={styles.profileSlash}>/</span>
					<span className={styles.profileStat}>
						<CardsGlyph />
						{profile.cardCount}
					</span>
				</div>
			</div>
		</div>
	);
}

/** Staggered rise-in transform for a result at index `i`, given a 0..1 entry value. */
function riseStyle(entry: number, i: number): React.CSSProperties {
	const local = Math.min(1, Math.max(0, entry * 3 - i));
	return { opacity: local, transform: `translateY(${(1 - local) * 24}px)` };
}

export function SearchDemo({
	progress,
	isStatic,
	labels,
}: {
	progress: number;
	isStatic: boolean;
	labels: SearchDemoLabels;
}) {
	// Static (reduced-motion / mobile) rests on the Cards beat — the most iconic
	// state — with all three tabs visible. isStatic comes from PinnedFeature; it
	// is NOT derived from progress (useScrollProgress clamps to 1 on live scroll).
	const tab = isStatic ? 0 : activeBeat(progress);
	const beat = BEATS[tab];
	const nextStart = tab < 2 ? BEATS[tab + 1].start : 1;

	// Query text for the active beat, typed out over the beat's first 0.1.
	const typed = isStatic ? 1 : seg(progress, beat.start, Math.min(beat.start + 0.1, nextStart));
	const shownQuery = beat.query.slice(0, Math.round(beat.query.length * typed));

	// Results entry value: ramps 0→1 over the middle of the active beat.
	const entry = isStatic ? 1 : seg(progress, beat.start + 0.08, nextStart - 0.02);

	const tabDefs = [labels.cards, labels.decks, labels.profiles];

	return (
		<div className={styles.wrap}>
			<div className={styles.bar}>
				<span className={styles.icon}>{'⌕'}</span>
				<span className={styles.query}>{shownQuery}</span>
				<span className={styles.caret} />
			</div>

			<nav className={styles.tabs} aria-label="Search entities">
				{tabDefs.map((label, i) => (
					<span key={label} className={`${styles.tab} ${i === tab ? styles.tabActive : ''}`}>
						{label}
					</span>
				))}
			</nav>

			<div className={styles.results}>
				{tab === 0 &&
					SEARCH_CARDS.map((card, i) => {
						const local = Math.min(1, Math.max(0, entry * 3 - i));
						const isHero = i === 0;
						return (
							<div
								key={card.name}
								className={styles.cardResult}
								style={{
									opacity: local,
									transform: `translateY(${(1 - local) * 24}px) ${
										isHero ? `scale(${1 + entry * 0.18})` : ''
									}`,
									zIndex: isHero ? 3 : 1,
								}}
							>
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

				{tab === 1 &&
					SEARCH_DECKS.map((deck, i) => (
						<div key={deck.name} className={styles.deckSlot} style={riseStyle(entry, i)}>
							<MiniDeckCard deck={deck} />
						</div>
					))}

				{tab === 2 &&
					SEARCH_PROFILES.map((profile, i) => (
						<div key={profile.nickname} className={styles.profileSlot} style={riseStyle(entry, i)}>
							<MiniProfileCard profile={profile} typeLabel={labels.profileType} />
						</div>
					))}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Lint the changed file** (Task 3 supplies the CSS classes; missing CSS does not fail eslint).

Run: `npx eslint "src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx"`
Expected: no NEW problems. (Unused-CSS is not an eslint concern; TS type errors would show here.)

- [ ] **Step 3: Commit.**

```bash
git add "src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx"
git commit -m "feat(landing): rewrite SearchDemo as multi-entity beats

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: SearchDemo styles (tab bar + mock cards + morph)

**Files:**

- Rewrite: `src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.module.css`

**Interfaces:**

- Consumes: class names referenced in Task 2 (`wrap`, `bar`, `icon`, `query`, `caret`, `tabs`, `tab`, `tabActive`, `results`, `cardResult`, `deckSlot`, `deckCard`, `deckArt`, `deckScrim`, `pips`, `pip`, `deckMeta`, `deckName`, `deckFormat`, `profileSlot`, `profileCard`, `profileTitleBar`, `profileNick`, `profileArt`, `profileArtImg`, `ghost`, `profileType`, `profileText`, `profileBadge`, `profileStat`, `profileSlash`).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Replace the whole file** with the styles below. Keeps the existing centered composition and blinking caret; adds a tab bar mirroring `SearchEntitySwitcher`, a cover-forward mini deck card, and a 63/88 mini profile card echoing `ProfileCard.module.css`.

```css
/* Centered block: bar + tabs + results, vertically centered in the frame. */
.wrap {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
	justify-content: center;
	align-items: stretch;
}

/* ── Search bar ── */
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

/* ── Tab bar (mirrors SearchEntitySwitcher) ── */
.tabs {
	display: flex;
	gap: 0.25rem;
	align-self: center;
	padding: 0.25rem;
	background: rgba(255, 255, 255, 0.04);
	border-radius: 999px;
}
.tab {
	padding: 0.35rem 0.9rem;
	border-radius: 999px;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--text-muted, #9aa0ad);
	transition:
		color 0.3s ease,
		background 0.3s ease;
}
.tabActive {
	color: #0c0c12;
	background: rgba(201, 168, 76, 1);
}

/* ── Results zone: fixed height so cards stay centered ── */
.results {
	position: relative;
	display: flex;
	gap: 0.9rem;
	justify-content: center;
	align-items: center;
	height: 300px;
	margin-top: 0.25rem;
}

/* ── Cards beat ── */
.cardResult {
	width: 32%;
	max-width: 168px;
	will-change: transform, opacity;
}
.cardResult :global(img) {
	width: 100%;
	height: auto;
	border-radius: 8px;
}

/* ── Decks beat: cover-forward mini DeckCard ── */
.deckSlot {
	width: 44%;
	max-width: 230px;
	will-change: transform, opacity;
}
.deckCard {
	position: relative;
	overflow: hidden;
	border-radius: 4px;
	border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
	background: #16181f;
	aspect-ratio: 244 / 170;
}
.deckArt {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}
.deckScrim {
	position: absolute;
	inset: 0;
	background: linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.78) 100%);
}
.pips {
	position: absolute;
	top: 8px;
	right: 8px;
	display: flex;
	gap: 3px;
	padding: 3px 5px;
	background: rgba(0, 0, 0, 0.45);
	border-radius: 999px;
}
.pip {
	width: 11px;
	height: 11px;
	border-radius: 50%;
	box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
}
.deckMeta {
	position: absolute;
	left: 10px;
	right: 10px;
	bottom: 8px;
	display: flex;
	flex-direction: column;
	gap: 3px;
}
.deckName {
	font-size: 0.95rem;
	font-weight: 700;
	color: #fff;
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.deckFormat {
	align-self: flex-start;
	padding: 2px 8px;
	border-radius: 4px;
	font-size: 0.7rem;
	font-weight: 600;
	color: var(--foreground, #e8e8ea);
	background: rgba(255, 255, 255, 0.14);
}

/* ── Profiles beat: mini ProfileCard (63/88), echoes ProfileCard.module.css ── */
.profileSlot {
	width: 30%;
	max-width: 150px;
	will-change: transform, opacity;
}
.profileCard {
	position: relative;
	display: flex;
	flex-direction: column;
	aspect-ratio: 63 / 88;
	overflow: hidden;
	border-radius: 5% / 3.6%;
	border: 3px solid #0c0c12;
	background: linear-gradient(165deg, #23222c 0%, #17161e 55%, #100f16 100%);
	box-shadow:
		0 4px 14px rgba(0, 0, 0, 0.5),
		inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}
.profileTitleBar {
	padding: 5px 8px;
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01));
	border-bottom: 1px solid rgba(0, 0, 0, 0.55);
}
.profileNick {
	font-weight: 700;
	font-size: 0.8rem;
	color: var(--foreground, #e8e8ea);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	display: block;
}
.profileArt {
	position: relative;
	flex: 0 0 48%;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	background: radial-gradient(circle at 50% 38%, var(--surface-hover, #2a2a34) 0%, #0c0c12 100%);
	border-top: 1px solid rgba(255, 255, 255, 0.05);
	border-bottom: 2px solid rgba(0, 0, 0, 0.6);
}
.profileArtImg {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}
.ghost {
	width: 40%;
	height: 40%;
	color: rgba(255, 255, 255, 0.1);
}
.profileType {
	padding: 3px 8px;
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01));
	border-bottom: 1px solid rgba(0, 0, 0, 0.5);
	font-size: 0.62rem;
	font-weight: 600;
	color: var(--foreground, #e8e8ea);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.profileText {
	display: flex;
	flex: 1;
	min-height: 0;
	align-items: flex-end;
	justify-content: flex-end;
	padding: 8px;
	background: linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.4));
}
.profileBadge {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 3px 8px;
	border-radius: 5px;
	background: linear-gradient(180deg, #2b2a36, #16151d);
	border: 1px solid rgba(255, 255, 255, 0.08);
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--foreground, #e8e8ea);
}
.profileStat {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.profileSlash {
	opacity: 0.45;
}
```

- [ ] **Step 2: Lint the changed file.**

Run: `npx eslint "src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.module.css"` (if the project's eslint ignores CSS, this is a no-op — that's fine) and rely on `npm run build` in Task 4 for CSS-module class resolution.
Expected: no NEW problems.

- [ ] **Step 3: Commit.**

```bash
git add "src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.module.css"
git commit -m "feat(landing): SearchDemo styles for tabs, mini deck & profile cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Thread isStatic through PinnedFeature + forward labels from FeatureSections

**Files:**

- Modify: `src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.tsx`
- Modify: `src/app/[locale]/(landing)/components/FeatureSections.tsx`

**Interfaces:**

- Consumes: `SearchDemo` new signature `{ progress, isStatic, labels }` (Task 2).
- Produces: `renderDemo` prop widened to `(progress: number, isStatic: boolean) => ReactNode`.

- [ ] **Step 1: Widen `renderDemo` to also pass `isStatic`.** In `PinnedFeature.tsx`, `isStatic` is already computed (`const isStatic = reduced || mobile;`). Update the prop type and the call site.

Change the interface line:

```tsx
renderDemo: (progress: number) => ReactNode;
```

to:

```tsx
renderDemo: (progress: number, isStatic: boolean) => ReactNode;
```

Change the call site (currently `<div className={styles.demo}>{renderDemo(progress)}</div>`) to:

```tsx
<div className={styles.demo}>{renderDemo(progress, isStatic)}</div>
```

All other demos use `(p) => …` and simply ignore the second arg — no other call site changes.

- [ ] **Step 2: Read the `search` namespace and pass labels + isStatic.** In `FeatureSections.tsx`, add a second `useTranslations` for `search` (the component already has `const t = useTranslations('landing');`).

Add after the existing `const t = ...` line:

```tsx
const ts = useTranslations('search');
```

Replace the Search `renderDemo` (currently `renderDemo={(p) => <SearchDemo progress={p} />}`) with:

```tsx
					renderDemo={(p, isStatic) => (
						<SearchDemo
							progress={p}
							isStatic={isStatic}
							labels={{
								cards: ts('entityCards'),
								decks: ts('entityDecks'),
								profiles: ts('entityProfiles'),
								profileType: ts('profileTypeLine'),
							}}
						/>
					)}
```

- [ ] **Step 3: Lint the changed files.**

Run: `npx eslint "src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.tsx" "src/app/[locale]/(landing)/components/FeatureSections.tsx"`
Expected: no NEW problems.

- [ ] **Step 4: Build (catches TS + CSS-module class errors across all files).**

Run: `npm run build`
Expected: build succeeds (no type error on `SearchDemo` props or the widened `renderDemo`, no missing-module errors).

- [ ] **Step 5: Commit.**

```bash
git add "src/app/[locale]/(landing)/components/PinnedFeature/PinnedFeature.tsx" "src/app/[locale]/(landing)/components/FeatureSections.tsx"
git commit -m "feat(landing): thread isStatic + search labels into SearchDemo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Runtime verification

**Files:**

- None (verification only). The static/reduced-motion logic already lives in Task 2's `SearchDemo` via the `isStatic` prop threaded in Task 4.

**Interfaces:**

- Consumes: everything above.
- Produces: final verified behavior.

- [ ] **Step 1: Runtime verification.**

Run: `npm run dev`
Then in a browser at the landing page:

1. Scroll into the Search section. Confirm three beats play in order: **Cards** (types "Lightning Bolt", 3 card images, first lifts), **Decks** (tab slides to Decks, "Gruul aggro", 2 cover cards with format pill + color pips), **Profiles** (tab slides to Profiles, "@planeswalker", 2 ghost profile cards with `🗎/🃏` badge).
2. Confirm the active tab pill tracks the beat and results never desync from the tab.
3. Confirm card images and deck art-crops load (through `scryfallImageLoader`) — no broken images.
4. Toggle OS "reduce motion" (or resize to mobile ≤768px) and reload: confirm the demo renders the **Cards** static state with all three tabs visible.

Expected: all four confirmations pass. If a beat feels mistimed, adjust the `BEATS[*].start` values and the `entry`/`typed` sub-ranges only (no structural change).

- [ ] **Step 2: Full check (record baseline delta).**

Run: `npm run check`
Expected: no NEW problems attributable to the five touched files (baseline is red ~60 pre-existing problems in unrelated files — memory `project_check_red_baseline`). Confirm none of the new problems reference the SearchDemo/demoContent/FeatureSections/PinnedFeature files.

- [ ] **Step 3: No commit needed** — Task 5 changes no files. If Step 1 required a timing tweak to `SearchDemo.tsx`, commit it:

```bash
git add "src/app/[locale]/(landing)/components/demos/SearchDemo/SearchDemo.tsx"
git commit -m "fix(landing): tune SearchDemo beat timing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** tab bar + search bar chrome (Task 2/3), three beats Cards/Decks/Profiles (Task 2), mini DeckCard (Task 2/3), mini ProfileCard (Task 2/3), static data (Task 1), i18n labels forwarded (Task 4), static Cards-beat state (Task 2 logic + Task 4 `isStatic` threading, verified Task 5). All spec sections mapped.
- **No fetch / no deps / loader usage / no real-component import:** enforced in Global Constraints and Task 2 code.
- **Type consistency:** `SearchDemoLabels` (Task 2) matches the `labels={{ cards, decks, profiles, profileType }}` object passed in Task 4. `SearchDemo`'s `{ progress, isStatic, labels }` signature (Task 2) matches the `renderDemo={(p, isStatic) => <SearchDemo …/>}` call (Task 4) and the widened `renderDemo: (progress, isStatic) => ReactNode` prop (Task 4 PinnedFeature). `DemoDeckResult`/`DemoProfileResult` field names (Task 1) match their use in `MiniDeckCard`/`MiniProfileCard` (Task 2). `activeBeat`, `BEATS`, `riseStyle` defined and used in the same file.
- **Static-signal correctness:** `isStatic` is an explicit prop from `PinnedFeature` (`reduced || mobile`), NOT `progress === 1` — because `useScrollProgress` clamps to `1` on live scroll too, so a `progress`-derived guard would wrongly snap a live scroller from Profiles back to Cards at the section's end.
