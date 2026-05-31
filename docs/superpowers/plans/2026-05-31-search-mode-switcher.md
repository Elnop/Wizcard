# Search Mode Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `CustomProxiesSection` ON/OFF toggle with a segmented control `Officiel | Tout | Custom` in the search bar row, controlling which results are shown.

**Architecture:** A `SearchModeSwitcher` component (pill-style segmented control) is added to `src/app/search/page.tsx`'s search row. Mode state is stored in `localStorage` (`mpc-search-mode`, default `'official'`). The page conditionally renders the Scryfall `CardList` (shown in `official` and `all` modes) and `CustomProxiesSection` (shown in `custom` and `all` modes). `CustomProxiesSection` loses its own toggle — it always renders its content when mounted. The section header is simplified accordingly.

**Tech Stack:** React `useState`, `localStorage`, CSS Modules, TypeScript

---

## File Map

| Action     | File                                                                          | Responsibility                                                             |
| ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Create** | `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx`         | Segmented control UI (Officiel / Tout / Custom)                            |
| **Create** | `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.module.css`  | Pill/segmented control styles                                              |
| **Modify** | `src/app/search/page.tsx`                                                     | Add switcher to search row, gate CardList and CustomProxiesSection on mode |
| **Modify** | `src/app/search/page.module.css`                                              | Remove any needed adjustments (minor)                                      |
| **Modify** | `src/lib/mpc/components/CustomProxiesSection/CustomProxiesSection.tsx`        | Remove toggle entirely — section always shows content when mounted         |
| **Modify** | `src/lib/mpc/components/CustomProxiesSection/CustomProxiesSection.module.css` | Remove toggle-related styles                                               |

---

## Task 1: Create `SearchModeSwitcher` component

**Files:**

- Create: `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx`
- Create: `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.module.css`

The switcher has three options: `'official'` | `'all'` | `'custom'`. It reads/writes from `localStorage` key `mpc-search-mode`.

- [ ] **Step 1: Create `SearchModeSwitcher.tsx`**

```typescript
'use client';

import styles from './SearchModeSwitcher.module.css';

export type SearchMode = 'official' | 'all' | 'custom';

const STORAGE_KEY = 'mpc-search-mode';
const DEFAULT_MODE: SearchMode = 'official';

const OPTIONS: { value: SearchMode; label: string }[] = [
	{ value: 'official', label: 'Officiel' },
	{ value: 'all', label: 'Tout' },
	{ value: 'custom', label: 'Custom' },
];

type Props = {
	value: SearchMode;
	onChange: (mode: SearchMode) => void;
};

export function SearchModeSwitcher({ value, onChange }: Props) {
	return (
		<div className={styles.switcher} role="group" aria-label="Mode de recherche">
			{OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={`${styles.option} ${value === opt.value ? styles.active : ''}`}
					onClick={() => onChange(opt.value)}
					aria-pressed={value === opt.value}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

export function readSearchMode(): SearchMode {
	if (typeof window === 'undefined') return DEFAULT_MODE;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'official' || stored === 'all' || stored === 'custom') return stored;
	return DEFAULT_MODE;
}

export function writeSearchMode(mode: SearchMode): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, mode);
}
```

- [ ] **Step 2: Create `SearchModeSwitcher.module.css`**

```css
.switcher {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 3px;
	gap: 2px;
}

.option {
	padding: 6px 14px;
	background: transparent;
	border: none;
	border-radius: 8px;
	color: var(--text-muted);
	font-size: var(--text-sm);
	font-weight: 500;
	cursor: pointer;
	white-space: nowrap;
	transition:
		background 0.15s,
		color 0.15s;
}

.option:hover {
	color: var(--foreground);
}

.active {
	background: var(--primary);
	color: var(--primary-text);
}

.active:hover {
	color: var(--primary-text);
}

@media (max-width: 768px) {
	.option {
		padding: 6px 10px;
		font-size: var(--text-xs);
	}
}
```

- [ ] **Step 3: Run check**

```bash
cd /home/elthinkbuntu/Documents/Wizcard/.claude/worktrees/feature+mpc-custom-cards
npm run check 2>&1 | head -40
```

Expected: no errors on these new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx \
        src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.module.css
git commit -m "feat: add SearchModeSwitcher segmented control component"
```

---

## Task 2: Wire `SearchModeSwitcher` into the search page

**Files:**

- Modify: `src/app/search/page.tsx`

The switcher is added to `.searchRow` (after the filters button). Mode state is initialized from `localStorage` via `readSearchMode()`. `CardList` and related Scryfall UI is hidden when `mode === 'custom'`. `CustomProxiesSection` is hidden when `mode === 'official'`.

- [ ] **Step 1: Update `src/app/search/page.tsx`**

Replace the entire file with:

```typescript
'use client';

import { useState, useCallback, Suspense } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { Spinner } from '@/components/Spinner/Spinner';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { CustomProxiesSection } from '@/lib/mpc/components/CustomProxiesSection/CustomProxiesSection';
import {
	SearchModeSwitcher,
	readSearchMode,
	writeSearchMode,
} from './components/SearchModeSwitcher/SearchModeSwitcher';
import type { SearchMode } from './components/SearchModeSwitcher/SearchModeSwitcher';
import { useSearchFiltersFromUrl } from './useSearchFiltersFromUrl';
import styles from './page.module.css';

export default function SearchPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchPageContent />
		</Suspense>
	);
}

function SearchPageContent() {
	const { addCard } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
	const [mode, setMode] = useState<SearchMode>(readSearchMode);

	const {
		name,
		setName,
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		setOrder,
		dir,
		setDir,
		applyFilters,
		activeFilterCount,
	} = useSearchFiltersFromUrl();

	const [isModalOpen, setIsModalOpen] = useState(false);

	const { sets, isLoading: setsLoading } = useScryfallSets();
	const {
		cards,
		isLoading,
		isLoadingMore,
		error,
		queryError,
		hasMore,
		totalCards,
		suggestions,
		loadMore,
	} = useScryfallCardSearch({
		name,
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
	});

	const handleCardClick = useCallback((card: ScryfallCard) => setSelectedCard(card), []);

	function handleModeChange(next: SearchMode) {
		setMode(next);
		writeSearchMode(next);
	}

	const showOfficial = mode === 'official' || mode === 'all';
	const showCustom = mode === 'custom' || mode === 'all';

	const hasFilters =
		name || colors.length > 0 || type || set || rarities.length > 0 || oracleText || cmc;
	const showEmptyState = showOfficial && !hasFilters && !isLoading && cards.length === 0;

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<div className={styles.searchRow}>
						<SearchBar value={name} onChange={setName} placeholder="Search for cards..." />
						<SearchModeSwitcher value={mode} onChange={handleModeChange} />
						<button
							type="button"
							className={styles.filtersButton}
							onClick={() => setIsModalOpen(true)}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M2 4h12M4 8h8M6 12h4"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
							Filtres
							{activeFilterCount > 0 && (
								<span className={styles.filterBadge}>{activeFilterCount}</span>
							)}
						</button>
					</div>
				</div>

				<FilterModal
					isOpen={isModalOpen}
					colors={colors}
					colorMatch={colorMatch}
					type={type}
					set={set}
					rarities={rarities}
					oracleText={oracleText}
					cmc={cmc}
					sets={sets}
					setsLoading={setsLoading}
					order={order}
					dir={dir}
					onApply={applyFilters}
					onClose={() => setIsModalOpen(false)}
				/>

				{showOfficial && (
					<>
						{hasFilters && !isLoading && cards.length > 0 && (
							<div className={styles.resultInfo}>
								<span>
									Showing {cards.length} of {totalCards.toLocaleString()} cards
								</span>
							</div>
						)}

						{error && (
							<div className={styles.error}>
								<p>An error occurred. Please try again.</p>
							</div>
						)}

						{queryError && (
							<div className={styles.queryError}>
								<p>{queryError.message}</p>
								{queryError.warnings.length > 0 && (
									<ul className={styles.queryWarnings}>
										{queryError.warnings.map((w) => (
											<li key={w}>{w}</li>
										))}
									</ul>
								)}
							</div>
						)}

						{showEmptyState && (
							<div className={styles.emptyState}>
								<h2>Start searching</h2>
								<p>Enter a card name or apply filters to find Magic: The Gathering cards.</p>
							</div>
						)}

						<CardList
							cards={cards}
							isLoading={isLoading}
							isLoadingMore={isLoadingMore}
							hasMore={hasMore}
							onLoadMore={loadMore}
							onCardClick={handleCardClick}
							sortOrder={order}
							sortDir={dir}
							onSortChange={(newOrder, newDir) => {
								setOrder(newOrder as Parameters<typeof setOrder>[0]);
								setDir(newDir);
							}}
							pageSize={false}
							tableColumns={[
								{ key: 'name', label: 'Nom', sortKey: 'name' },
								{
									key: 'set',
									label: 'Set',
									sortKey: 'set',
									render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
								},
								{ key: 'type_line', label: 'Type' },
								{ key: 'cmc', label: 'CMC', sortKey: 'cmc' },
								{
									key: 'prices',
									label: 'Prix USD',
									sortKey: 'usd',
									render: (card) =>
										'prices' in card && card.prices && 'usd' in card.prices
											? (card.prices.usd ?? '—')
											: '—',
								},
							]}
						/>

						{!isLoading && hasFilters && cards.length === 0 && !error && (
							<div className={styles.noResults}>
								<h3>No cards found</h3>
								{suggestions.length > 0 ? (
									<>
										<p>Did you mean:</p>
										<ul className={styles.suggestions}>
											{suggestions.map((s) => (
												<li key={s}>
													<button
														type="button"
														className={styles.suggestionLink}
														onClick={() => setName(s)}
													>
														{s}
													</button>
												</li>
											))}
										</ul>
									</>
								) : (
									<p>Try adjusting your search or filters.</p>
								)}
							</div>
						)}
					</>
				)}

				{showCustom && <CustomProxiesSection />}

				{selectedCard && (
					<CardModal
						cards={selectedCard}
						onClose={() => setSelectedCard(null)}
						onAddToCollection={(card, entry) => {
							addCard(card, entry);
						}}
						onAddToWishlist={(card, entry) => {
							addToWishlist(card, entry);
						}}
					/>
				)}
			</main>
		</div>
	);
}
```

- [ ] **Step 2: Run check**

```bash
npm run check 2>&1 | head -60
```

Fix any TypeScript errors. If only Prettier, run `npm run check:fix`.

- [ ] **Step 3: Commit**

```bash
git add src/app/search/page.tsx
git commit -m "feat: wire SearchModeSwitcher into search page — gate official/custom sections on mode"
```

---

## Task 3: Simplify `CustomProxiesSection` — remove the toggle

**Files:**

- Modify: `src/lib/mpc/components/CustomProxiesSection/CustomProxiesSection.tsx`
- Modify: `src/lib/mpc/components/CustomProxiesSection/CustomProxiesSection.module.css`

The section is now always mounted when visible (the page controls that). The header toggle (`enabled` state, `ENABLED_KEY`, `toggle()`, and the `{enabled && ...}` wrapper) must be removed. The section header should still show the title and MPC badge, but no toggle.

- [ ] **Step 1: Replace `CustomProxiesSection.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { useMpcStore } from '../../store/mpc-store';
import { toSyntheticScryfallCard } from '../../adapter';
import type { MpcSource } from '../../types';
import styles from './CustomProxiesSection.module.css';

export function CustomProxiesSection() {
	const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

	const {
		sources,
		sourcesLoading,
		sourcesError,
		cardsBySource,
		loadingSourceId,
		errorBySource,
		initSources,
		fetchSource,
	} = useMpcStore();
	const { addCard } = useCollectionContext();

	const activeSourceId = selectedSourceId ?? sources[0]?.id ?? null;

	useEffect(() => {
		void initSources();
	}, [initSources]);

	useEffect(() => {
		if (activeSourceId) {
			void fetchSource(activeSourceId);
		}
	}, [activeSourceId, fetchSource]);

	const activeSource: MpcSource | undefined = sources.find((s) => s.id === activeSourceId);
	const cards = activeSourceId ? (cardsBySource[activeSourceId] ?? []) : [];
	const isLoading = loadingSourceId === activeSourceId;
	const error = activeSourceId ? errorBySource[activeSourceId] : undefined;

	return (
		<div className={styles.section}>
			<div className={styles.header}>
				<div className={styles.titleRow}>
					<span className={styles.title}>Custom Proxies</span>
					<span className={styles.badge}>MPC</span>
				</div>
			</div>

			{sourcesLoading && (
				<div className={styles.loading}>
					<Spinner size="md" />
					<p>Loading sources…</p>
				</div>
			)}

			{sourcesError && !sourcesLoading && (
				<div className={styles.error}>
					<p>Failed to load sources: {sourcesError}</p>
				</div>
			)}

			{!sourcesLoading && !sourcesError && sources.length > 0 && (
				<div className={styles.sourceTabs}>
					{sources.map((source) => (
						<button
							key={source.id}
							type="button"
							className={`${styles.sourceTab} ${source.id === activeSourceId ? styles.sourceTabActive : ''}`}
							onClick={() => {
								setSelectedSourceId(source.id);
								void fetchSource(source.id);
							}}
						>
							{source.name}
							{!source.isBuiltIn && <span className={styles.userBadge}>custom</span>}
						</button>
					))}
				</div>
			)}

			{isLoading && (
				<div className={styles.loading}>
					<Spinner size="md" />
				</div>
			)}

			{error && !isLoading && (
				<div className={styles.error}>
					<p>Failed to load cards: {error}</p>
				</div>
			)}

			{!isLoading && !error && cards.length > 0 && activeSource && (
				<div className={styles.grid}>
					{cards.map((card) => {
						const synthetic = toSyntheticScryfallCard(card, activeSource);
						return (
							<div key={card.id} className={styles.card}>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={card.imageUrl}
									alt={card.name}
									className={styles.cardImage}
									loading="lazy"
								/>
								<div className={styles.cardOverlay}>
									<span className={styles.cardName}>{card.name}</span>
									<button
										type="button"
										className={styles.addButton}
										onClick={() =>
											addCard(synthetic, {
												proxy: true,
												tags: ['custom:mpc', `mpc-source:${card.sourceId}`],
											})
										}
									>
										+ Add
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{!isLoading &&
				!error &&
				!sourcesError &&
				cards.length === 0 &&
				activeSourceId &&
				!sourcesLoading && (
					<div className={styles.empty}>
						<p>No cards found in this source.</p>
					</div>
				)}
		</div>
	);
}
```

- [ ] **Step 2: Remove toggle styles from `CustomProxiesSection.module.css`**

Remove the entire `/* Toggle */` block (lines 37–79 in the current file):

```css
/* Toggle */
.toggle {
	display: flex;
	align-items: center;
	cursor: pointer;
}

.toggle input {
	position: absolute;
	opacity: 0;
	width: 0;
	height: 0;
}

.toggleTrack {
	position: relative;
	display: block;
	width: 44px;
	height: 24px;
	background: var(--border);
	border-radius: 12px;
	transition: background 0.2s;
}

.toggle input:checked + .toggleTrack {
	background: var(--primary);
}

.toggleThumb {
	position: absolute;
	top: 3px;
	left: 3px;
	width: 18px;
	height: 18px;
	background: white;
	border-radius: 50%;
	transition: transform 0.2s;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle input:checked + .toggleTrack .toggleThumb {
	transform: translateX(20px);
}
```

The full CSS file after removal should be:

```css
.section {
	margin-top: 40px;
	border-top: 1px solid var(--border);
	padding-top: 32px;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16px;
}

.titleRow {
	display: flex;
	align-items: center;
	gap: 10px;
}

.title {
	font-size: var(--text-lg);
	font-weight: 600;
	color: var(--foreground);
}

.badge {
	font-size: var(--text-xs);
	font-weight: 700;
	letter-spacing: 0.05em;
	padding: 2px 8px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 6px;
	color: var(--text-muted);
}

/* Source tabs */
.sourceTabs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 20px;
}

.sourceTab {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 14px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 20px;
	color: var(--text-muted);
	font-size: var(--text-sm);
	cursor: pointer;
	transition:
		border-color 0.15s,
		color 0.15s;
}

.sourceTab:hover {
	border-color: var(--primary);
	color: var(--foreground);
}

.sourceTabActive {
	border-color: var(--primary);
	color: var(--foreground);
	background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.userBadge {
	font-size: 10px;
	padding: 1px 5px;
	background: var(--border);
	border-radius: 4px;
	color: var(--text-muted);
}

/* Card grid */
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 12px;
}

.card {
	position: relative;
	border-radius: 8px;
	overflow: hidden;
	background: var(--surface);
	border: 1px solid var(--border);
	aspect-ratio: 3 / 4;
	cursor: pointer;
}

.card:hover .cardOverlay {
	opacity: 1;
}

.cardImage {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.cardOverlay {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	padding: 12px;
	gap: 8px;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, transparent 60%);
	opacity: 0;
	transition: opacity 0.2s;
}

.cardName {
	font-size: var(--text-sm);
	font-weight: 500;
	color: white;
	text-align: center;
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.addButton {
	padding: 6px 16px;
	background: var(--primary);
	color: var(--primary-text);
	border: none;
	border-radius: 6px;
	font-size: var(--text-sm);
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
}

.addButton:hover {
	opacity: 0.85;
}

/* States */
.loading {
	display: flex;
	justify-content: center;
	padding: 48px 0;
}

.error {
	padding: 16px 20px;
	color: var(--error);
	background: rgba(239, 68, 68, 0.08);
	border: 1px solid rgba(239, 68, 68, 0.2);
	border-radius: 10px;
	font-size: var(--text-sm);
}

.error p {
	margin: 0;
}

.empty {
	padding: 48px 24px;
	text-align: center;
	color: var(--text-muted);
	font-size: var(--text-sm);
}

.empty p {
	margin: 0;
}

@media (max-width: 768px) {
	.grid {
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
	}
}
```

- [ ] **Step 3: Run full check**

```bash
npm run check 2>&1
```

Expected: 0 errors. If Prettier issues, run `npm run check:fix` then re-verify.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mpc/components/CustomProxiesSection/CustomProxiesSection.tsx \
        src/lib/mpc/components/CustomProxiesSection/CustomProxiesSection.module.css
git commit -m "feat: remove toggle from CustomProxiesSection — visibility now controlled by SearchModeSwitcher"
```

---

## Self-Review

**Spec coverage:**

- ✅ Segmented control `Officiel | Tout | Custom` in search bar — Task 1 + Task 2
- ✅ Default mode = `'official'` (no custom visible by default) — `readSearchMode()` returns `'official'` when no stored value
- ✅ Mode persisted in `localStorage` (`mpc-search-mode`) — `writeSearchMode()` in Task 2
- ✅ Scryfall results hidden in `custom` mode — `showOfficial` gate in Task 2
- ✅ Custom section shown in `custom` and `all` modes — `showCustom` gate in Task 2
- ✅ Toggle removed from `CustomProxiesSection` — Task 3
- ✅ Auto-fetch first source on mount (no toggle required) — second `useEffect` in Task 3 no longer gated on `enabled`

**Breaking changes:** The `mpc-search-enabled` localStorage key is now orphaned (was the old toggle). It's harmless to leave it — browsers will just ignore it. No migration needed.

**Type consistency:** `SearchMode = 'official' | 'all' | 'custom'` is defined in `SearchModeSwitcher.tsx` and imported in `page.tsx` with a named import. Consistent throughout.
