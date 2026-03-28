# CardList Refactor — Sub-components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `CardList.tsx` into three focused components (`CardList` orchestrator, `CardListGrid`, `CardListTable`) each in their own folder with dedicated CSS and type files.

**Architecture:** `CardList` keeps all state (viewMode, collapsedSections, pagination) and delegates rendering to `CardListGrid` and `CardListTable`. Sub-components are purely presentational with simplified props. No barrel exports — consumers import directly from the file that owns the type.

**Tech Stack:** React, Next.js, CSS Modules, TypeScript

---

## File Map

| Action | Path                                                        | Responsibility                                                     |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Modify | `src/components/ui/CardList/CardList.tsx`                   | Orchestrator only — state + toggle + delegation                    |
| Modify | `src/components/ui/CardList/CardList.module.css`            | Toggle styles only (viewToggle, toggleBtn, toggleBtnActive)        |
| Create | `src/components/ui/CardList/CardList.types.ts`              | CardListProps, CardListCards, CardListSection, AnyCard, isSections |
| Create | `src/components/ui/CardListGrid/CardListGrid.tsx`           | Grid rendering + section layout + skeletons                        |
| Create | `src/components/ui/CardListGrid/CardListGrid.module.css`    | Grid, item, skeleton, overlay, section, chevron styles             |
| Create | `src/components/ui/CardListGrid/CardListGrid.types.ts`      | CardListGridProps                                                  |
| Create | `src/components/ui/CardListTable/CardListTable.tsx`         | Table rendering + SortIcon                                         |
| Create | `src/components/ui/CardListTable/CardListTable.module.css`  | tableContainer, table, thSortable, clickableRow styles             |
| Create | `src/components/ui/CardListTable/CardListTable.types.ts`    | CardListTableProps, CardListColumn                                 |
| Modify | `src/app/collection/page.tsx`                               | Update CardListColumn import path                                  |
| Modify | `src/app/search/page.tsx`                                   | No type import changes needed                                      |
| Modify | `src/components/cards/tabs/PrintsTab.tsx`                   | Update CardListSection import path                                 |
| Modify | `src/lib/collection/components/ImportModal/ImportModal.tsx` | Update CardListColumn import path                                  |
| Modify | `src/lib/collection/components/ImportModal/tableColumns.ts` | Update CardListColumn import path                                  |

---

## Task 1: Create `CardList.types.ts`

**Files:**

- Create: `src/components/ui/CardList/CardList.types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/components/ui/CardList/CardList.types.ts
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { ScryfallSortDir } from '@/components/ui/filters/SortFilter/SortFilter';

export type AnyCard = ScryfallCard | Card;

export interface CardListSection {
	label: string;
	cards: AnyCard[];
}

export type CardListCards = AnyCard[] | CardListSection[];

export function isSections(cards: CardListCards): cards is CardListSection[] {
	return cards.length > 0 && 'label' in (cards[0] as object);
}

export interface CardListProps {
	cards: CardListCards;
	// Pagination intégrée
	isLoading?: boolean;
	isLoadingMore?: boolean;
	hasMore?: boolean;
	onLoadMore?: () => void;
	skeletonCount?: number;
	// Interactions
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	// Table
	tableColumns?: import('@/components/ui/CardListTable/CardListTable.types').CardListColumn[];
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
	// Grille : nombre de cartes par ligne (fixe la taille des cartes)
	cardsPerLine?: number;
	className?: string;
	pageSize?: number | false;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/elnop/Documents/scute_swarm && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors (existing errors are fine, we haven't wired anything yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CardList/CardList.types.ts
git commit -m "feat(card-list): add CardList.types.ts with shared types"
```

---

## Task 2: Create `CardListTable.types.ts` and `CardListTable.module.css`

**Files:**

- Create: `src/components/ui/CardListTable/CardListTable.types.ts`
- Create: `src/components/ui/CardListTable/CardListTable.module.css`

- [ ] **Step 1: Create the table types file**

```typescript
// src/components/ui/CardListTable/CardListTable.types.ts
import type { ReactNode } from 'react';
import type { AnyCard } from '@/components/ui/CardList/CardList.types';
import type { ScryfallSortDir } from '@/components/ui/filters/SortFilter/SortFilter';

export interface CardListColumn {
	key: string;
	label: string;
	sortKey?: string;
	render?: (card: AnyCard) => ReactNode;
}

export interface CardListTableProps {
	cards: AnyCard[];
	columns: CardListColumn[];
	isLoading?: boolean;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
}
```

- [ ] **Step 2: Create the table CSS file**

Cut these classes from `CardList.module.css` (do NOT delete from source yet — copy them here first):

```css
/* src/components/ui/CardListTable/CardListTable.module.css */

.tableContainer {
	overflow-x: auto;
	border: 1px solid var(--border);
	border-radius: 8px;
}

.table {
	width: 100%;
	border-collapse: collapse;
	font-size: 13px;
}

.table th {
	position: sticky;
	top: 0;
	background: var(--card-bg, #1a1a2e);
	padding: 8px 12px;
	text-align: left;
	font-weight: 600;
	color: var(--text-muted);
	font-size: 12px;
	border-bottom: 1px solid var(--border);
}

.table td {
	padding: 6px 12px;
	color: var(--foreground);
	border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.table tr:nth-child(even) td {
	background: rgba(255, 255, 255, 0.02);
}

.thSortable {
	cursor: pointer;
	user-select: none;
	white-space: nowrap;
}

.thSortable:hover {
	color: var(--foreground);
	background: rgba(255, 255, 255, 0.06);
}

.thSortable svg {
	margin-left: 4px;
	vertical-align: middle;
	opacity: 0.8;
}

.clickableRow {
	cursor: pointer;
	transition: background 0.15s;
}

.clickableRow:hover td {
	background: rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CardListTable/CardListTable.types.ts src/components/ui/CardListTable/CardListTable.module.css
git commit -m "feat(card-list-table): add types and CSS for CardListTable"
```

---

## Task 3: Create `CardListTable.tsx`

**Files:**

- Create: `src/components/ui/CardListTable/CardListTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/CardListTable/CardListTable.tsx
import type { ScryfallSortDir } from '@/components/ui/filters/SortFilter/SortFilter';
import type { AnyCard } from '@/components/ui/CardList/CardList.types';
import type { CardListTableProps } from './CardListTable.types';
import styles from './CardListTable.module.css';

function SortIcon({ dir }: { dir: ScryfallSortDir }) {
	if (dir === 'desc') {
		return (
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path
					d="M8 3v10M4 9l4 4 4-4"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M8 13V3M4 7l4-4 4 4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CardListTable({
	cards,
	columns,
	onCardClick,
	sortOrder,
	sortDir,
	onSortChange,
}: CardListTableProps) {
	function handleHeaderClick(key: string) {
		if (!onSortChange) return;
		if (sortOrder === key) {
			onSortChange(key, sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			onSortChange(key, 'asc');
		}
	}

	return (
		<div className={styles.tableContainer}>
			<table className={styles.table}>
				<thead>
					<tr>
						{columns.map((col) => (
							<th
								key={col.key}
								onClick={col.sortKey ? () => handleHeaderClick(col.sortKey!) : undefined}
								className={col.sortKey ? styles.thSortable : undefined}
								aria-sort={
									col.sortKey && sortOrder === col.sortKey
										? sortDir === 'desc'
											? 'descending'
											: 'ascending'
										: undefined
								}
							>
								{col.label}
								{col.sortKey && sortOrder === col.sortKey && <SortIcon dir={sortDir ?? 'asc'} />}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{cards.map((c) => (
						<tr
							key={c.id}
							className={onCardClick ? styles.clickableRow : undefined}
							onClick={onCardClick ? () => onCardClick(c) : undefined}
						>
							{columns.map((col) => (
								<td key={col.key}>
									{col.render
										? col.render(c)
										: String((c as unknown as Record<string, unknown>)[col.key] ?? '')}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/elnop/Documents/scute_swarm && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CardListTable/CardListTable.tsx
git commit -m "feat(card-list-table): implement CardListTable component"
```

---

## Task 4: Create `CardListGrid.types.ts` and `CardListGrid.module.css`

**Files:**

- Create: `src/components/ui/CardListGrid/CardListGrid.types.ts`
- Create: `src/components/ui/CardListGrid/CardListGrid.module.css`

- [ ] **Step 1: Create the grid types file**

```typescript
// src/components/ui/CardListGrid/CardListGrid.types.ts
import type { ReactNode } from 'react';
import type { AnyCard, CardListSection } from '@/components/ui/CardList/CardList.types';

export interface CardListGridProps {
	cards: AnyCard[];
	sections?: CardListSection[];
	isLoading?: boolean;
	isLoadingMore?: boolean;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	cardsPerLine?: number;
	collapsedSections?: Set<string>;
	onSectionToggle?: (label: string) => void;
	className?: string;
}

// CSS class names intended for use inside renderOverlay
export const cardListGridOverlayStyles = {
	removeButton: 'cardRemoveBtn', // resolved at runtime from CardListGrid.module.css
};
```

- [ ] **Step 2: Create the grid CSS file**

Copy these classes from `CardList.module.css` (do NOT delete from source yet):

```css
/* src/components/ui/CardListGrid/CardListGrid.module.css */

/* Grid view */

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 24px;
	width: 100%;
}

.item {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.itemClickable {
	cursor: pointer;
	border-radius: 8px;
	transition: transform 0.15s;
}

.itemClickable:hover {
	transform: scale(1.03);
}

.imageWrapper {
	position: relative;
	width: 100%;
}

/* Force CardImage container (first child) to fill the grid cell */
.imageWrapper > :first-child {
	width: 100%;
}

.cardName {
	font-size: 14px;
	color: var(--foreground);
	text-align: center;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* Skeleton loading */

.skeletonImage {
	width: 100%;
	aspect-ratio: 63 / 88;
	border-radius: 8px;
	background: var(--border);
	animation: pulse 1.5s ease-in-out infinite;
}

.skeletonName {
	height: 14px;
	width: 70%;
	margin: 0 auto;
	border-radius: 4px;
	background: var(--border);
	animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.4;
	}
}

/* Empty state */

.empty {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 64px 24px;
	color: var(--text-muted);
	text-align: center;
}

/* Overlay remove button — used via renderOverlay */

.cardRemoveBtn {
	opacity: 0;
	transition: opacity 0.15s;
}

.imageWrapper:hover .cardRemoveBtn {
	opacity: 1;
}

@media (max-width: 768px) {
	.cardRemoveBtn {
		opacity: 1;
	}
}

/* Grid fixe (cardsPerLine) */

.gridFixed {
	display: grid;
	grid-template-columns: repeat(var(--cards-per-line), 1fr);
	gap: 16px;
	width: 100%;
	min-width: 0;
}

/* Responsive */

@media (max-width: 768px) {
	.grid {
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 16px;
	}

	.gridFixed {
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 12px;
	}
}

@media (max-width: 480px) {
	.grid {
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.gridFixed {
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}

	.cardName {
		font-size: 12px;
	}
}

/* Sections */

.sectionWrapper {
	margin-top: 24px;
}

.sectionWrapperFirst {
	margin-top: 0;
}

.sectionHeader {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 10px 0 6px;
	background: none;
	border: none;
	border-bottom: 1px solid var(--border);
	cursor: pointer;
	color: var(--foreground);
	font-size: 14px;
	font-weight: 600;
	text-align: left;
}

.sectionCount {
	font-size: 12px;
	color: var(--text-muted);
	font-weight: 400;
}

.chevron {
	margin-left: auto;
	font-size: 12px;
	color: var(--text-muted);
	transition: transform 0.2s;
	display: inline-block;
}

.chevronCollapsed {
	transform: rotate(-90deg);
}

.sectionBody {
	margin-top: 12px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CardListGrid/CardListGrid.types.ts src/components/ui/CardListGrid/CardListGrid.module.css
git commit -m "feat(card-list-grid): add types and CSS for CardListGrid"
```

---

## Task 5: Create `CardListGrid.tsx`

**Files:**

- Create: `src/components/ui/CardListGrid/CardListGrid.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/CardListGrid/CardListGrid.tsx
import { CardImage } from '@/components/cards/CardImage';
import type { CardListGridProps } from './CardListGrid.types';
import styles from './CardListGrid.module.css';

export { styles as cardListGridStyles };

const DEFAULT_SKELETON_COUNT = 12;

export function CardListGrid({
	cards,
	sections,
	isLoading = false,
	isLoadingMore = false,
	skeletonCount = DEFAULT_SKELETON_COUNT,
	onCardClick,
	renderOverlay,
	cardsPerLine,
	collapsedSections,
	onSectionToggle,
	className,
}: CardListGridProps) {
	const gridClass = [cardsPerLine ? styles.gridFixed : styles.grid, className]
		.filter(Boolean)
		.join(' ');
	const gridStyle = cardsPerLine
		? ({ '--cards-per-line': cardsPerLine } as React.CSSProperties)
		: undefined;

	function renderItems(cardItems: typeof cards, withLoadMoreSkeletons = false) {
		return (
			<div className={gridClass} style={gridStyle}>
				{cardItems.map((c) => (
					<div
						key={c.id}
						className={[styles.item, onCardClick ? styles.itemClickable : undefined]
							.filter(Boolean)
							.join(' ')}
						title={c.name}
						onClick={onCardClick ? () => onCardClick(c) : undefined}
					>
						<p className={styles.cardName}>{c.name}</p>
						<div className={styles.imageWrapper}>
							<CardImage card={c} size="normal" />
							{renderOverlay?.(c)}
						</div>
					</div>
				))}
				{withLoadMoreSkeletons &&
					isLoadingMore &&
					Array.from({ length: skeletonCount }).map((_, i) => (
						<div key={`skmore-${i}`} className={styles.item}>
							<div className={styles.skeletonImage} />
							<div className={styles.skeletonName} />
						</div>
					))}
			</div>
		);
	}

	// Sections mode
	if (sections && sections.length > 0) {
		return (
			<>
				{sections.map((section, idx) => {
					const collapsed = collapsedSections?.has(section.label) ?? false;
					const labelMatch = section.label.match(/^(.+?)\s*(\(\d+\))$/);
					const labelName = labelMatch?.[1] ?? section.label;
					const labelCount = labelMatch?.[2] ?? '';
					return (
						<div
							key={section.label}
							className={idx === 0 ? styles.sectionWrapperFirst : styles.sectionWrapper}
						>
							<button
								type="button"
								className={styles.sectionHeader}
								onClick={() => onSectionToggle?.(section.label)}
							>
								<span>
									{labelName}
									{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
								</span>
								<span
									className={[styles.chevron, collapsed ? styles.chevronCollapsed : '']
										.filter(Boolean)
										.join(' ')}
								>
									▾
								</span>
							</button>
							{!collapsed && <div className={styles.sectionBody}>{renderItems(section.cards)}</div>}
						</div>
					);
				})}
			</>
		);
	}

	// Initial skeleton
	if (isLoading && cards.length === 0) {
		return (
			<div className={gridClass} style={gridStyle}>
				{Array.from({ length: skeletonCount }).map((_, i) => (
					<div key={`sk-${i}`} className={styles.item}>
						<div className={styles.skeletonImage} />
						<div className={styles.skeletonName} />
					</div>
				))}
			</div>
		);
	}

	if (!isLoading && cards.length === 0) {
		return null;
	}

	return renderItems(cards, true);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/elnop/Documents/scute_swarm && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CardListGrid/CardListGrid.tsx
git commit -m "feat(card-list-grid): implement CardListGrid component"
```

---

## Task 6: Rewrite `CardList.tsx` as orchestrator

**Files:**

- Modify: `src/components/ui/CardList/CardList.tsx`

This is the main wiring step. Replace the full content of `CardList.tsx` with the orchestrator version that delegates to `CardListGrid` and `CardListTable`. The public API (`CardList` function, `cardListOverlayStyles` const) must remain identical to avoid breaking consumers.

- [ ] **Step 1: Rewrite `CardList.tsx`**

```tsx
// src/components/ui/CardList/CardList.tsx
'use client';

import { useState } from 'react';
import type { CardListProps } from './CardList.types';
import { isSections } from './CardList.types';
import { CardListGrid, cardListGridStyles } from '@/components/ui/CardListGrid/CardListGrid';
import { CardListTable } from '@/components/ui/CardListTable/CardListTable';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { PAGE_SIZE } from '@/lib/collection/constants';
import styles from './CardList.module.css';

export type { CardListSection } from './CardList.types';

// cardListOverlayStyles stays exported from here for backwards compat with consumers
// The actual CSS class lives in CardListGrid.module.css
export const cardListOverlayStyles = {
	removeButton: cardListGridStyles.cardRemoveBtn,
};

export function CardList({
	cards: cardsOrSections,
	isLoading = false,
	isLoadingMore = false,
	hasMore = false,
	onLoadMore,
	skeletonCount,
	onCardClick,
	renderOverlay,
	tableColumns,
	sortOrder,
	sortDir,
	onSortChange,
	cardsPerLine,
	className,
	pageSize = PAGE_SIZE,
}: CardListProps) {
	const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

	function toggleSection(label: string) {
		setCollapsedSections((prev) => {
			const next = new Set(prev);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	}

	const cards = isSections(cardsOrSections) ? [] : cardsOrSections;
	const sections = isSections(cardsOrSections) ? cardsOrSections : undefined;

	const localPageSize = typeof pageSize === 'number' ? pageSize : null;

	const [{ visibleCount, trackedLength }, setInternalPagination] = useState({
		visibleCount: localPageSize ?? cards.length,
		trackedLength: cards.length,
	});

	const effectiveVisibleCount =
		localPageSize !== null
			? cards.length !== trackedLength
				? localPageSize
				: visibleCount
			: cards.length;

	const internalHasMore = localPageSize !== null ? effectiveVisibleCount < cards.length : false;
	const internalLoadMore = () =>
		setInternalPagination((prev) => ({
			trackedLength: cards.length,
			visibleCount: prev.visibleCount + localPageSize!,
		}));

	const visibleCards = localPageSize !== null ? cards.slice(0, effectiveVisibleCount) : cards;
	const resolvedHasMore = localPageSize !== null ? internalHasMore : hasMore;
	const resolvedLoadMore = localPageSize !== null ? internalLoadMore : onLoadMore;

	const { sentinelRef } = useInfiniteScroll({
		onLoadMore: resolvedLoadMore ?? (() => {}),
		hasMore: resolvedHasMore && !!resolvedLoadMore,
		isLoading: isLoading || isLoadingMore,
	});

	const toggle = (
		<div className={styles.viewToggle}>
			<button
				type="button"
				className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleBtnActive : ''}`}
				onClick={() => setViewMode('grid')}
			>
				Grille
			</button>
			<button
				type="button"
				className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.toggleBtnActive : ''}`}
				onClick={() => setViewMode('table')}
			>
				Tableau
			</button>
		</div>
	);

	// Sections mode — CardListGrid handles section layout
	if (sections) {
		const sectionCards = sections.flatMap((s) => s.cards);
		return (
			<>
				{toggle}
				{viewMode === 'table' ? (
					<CardListTable
						cards={sectionCards}
						columns={tableColumns ?? []}
						onCardClick={onCardClick}
						sortOrder={sortOrder}
						sortDir={sortDir}
						onSortChange={onSortChange}
					/>
				) : (
					<CardListGrid
						cards={[]}
						sections={sections}
						onCardClick={onCardClick}
						renderOverlay={renderOverlay}
						cardsPerLine={cardsPerLine}
						collapsedSections={collapsedSections}
						onSectionToggle={toggleSection}
						className={className}
					/>
				)}
			</>
		);
	}

	if (viewMode === 'table') {
		return (
			<>
				{toggle}
				<CardListTable
					cards={visibleCards}
					columns={tableColumns ?? []}
					onCardClick={onCardClick}
					sortOrder={sortOrder}
					sortDir={sortDir}
					onSortChange={onSortChange}
				/>
				{resolvedHasMore && resolvedLoadMore && <div ref={sentinelRef} />}
			</>
		);
	}

	return (
		<>
			{toggle}
			<CardListGrid
				cards={visibleCards}
				isLoading={isLoading}
				isLoadingMore={isLoadingMore}
				skeletonCount={skeletonCount}
				onCardClick={onCardClick}
				renderOverlay={renderOverlay}
				cardsPerLine={cardsPerLine}
				className={className}
			/>
			{resolvedHasMore && resolvedLoadMore && <div ref={sentinelRef} />}
		</>
	);
}
```

- [ ] **Step 2: Update `CardList.module.css` — keep only toggle styles**

Replace the full content of `src/components/ui/CardList/CardList.module.css` with:

```css
/* View toggle */

.viewToggle {
	display: inline-flex;
	gap: 0;
	border: 1px solid var(--border);
	border-radius: 8px;
	overflow: hidden;
	flex-shrink: 0;
	margin-bottom: 12px;
}

.toggleBtn {
	padding: 6px 16px;
	background: none;
	border: none;
	color: var(--text-muted);
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition:
		background 0.15s,
		color 0.15s;
}

.toggleBtn:hover {
	color: var(--foreground);
}

.toggleBtnActive {
	background: var(--primary);
	color: #fff;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/elnop/Documents/scute_swarm && npx tsc --noEmit 2>&1 | head -50
```

Expected: no errors (or same pre-existing errors as before).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/CardList/CardList.tsx src/components/ui/CardList/CardList.module.css
git commit -m "refactor(card-list): rewrite as orchestrator, delegate to CardListGrid and CardListTable"
```

---

## Task 7: Update consumer import paths

**Files:**

- Modify: `src/lib/collection/components/ImportModal/tableColumns.ts`
- Modify: `src/lib/collection/components/ImportModal/ImportModal.tsx`
- Modify: `src/app/collection/page.tsx`
- Modify: `src/components/cards/tabs/PrintsTab.tsx`

No logic changes — only import paths.

- [ ] **Step 1: Update `tableColumns.ts`**

Change line 1 from:

```typescript
import type { CardListColumn } from '@/components/ui/CardList/CardList';
```

To:

```typescript
import type { CardListColumn } from '@/components/ui/CardListTable/CardListTable.types';
```

- [ ] **Step 2: Update `ImportModal.tsx`**

Change the import line from:

```typescript
import { CardList, type CardListColumn } from '@/components/ui/CardList/CardList';
```

To:

```typescript
import { CardList } from '@/components/ui/CardList/CardList';
import type { CardListColumn } from '@/components/ui/CardListTable/CardListTable.types';
```

- [ ] **Step 3: Update `collection/page.tsx`**

The `cardListOverlayStyles` import stays on `CardList` — no change needed there. But if `CardListColumn` is imported, update its path. Check the current import line:

```typescript
import { CardList, cardListOverlayStyles } from '@/components/ui/CardList/CardList';
```

No type imports from CardList in this file — no change needed.

- [ ] **Step 4: Update `PrintsTab.tsx`**

Change line from:

```typescript
import { CardList, type CardListSection } from '@/components/ui/CardList/CardList';
```

To:

```typescript
import { CardList } from '@/components/ui/CardList/CardList';
import type { CardListSection } from '@/components/ui/CardList/CardList.types';
```

- [ ] **Step 5: Run full check**

```bash
cd /home/elnop/Documents/scute_swarm && npm run check
```

Expected: no TypeScript errors, no ESLint errors, no Prettier issues.

- [ ] **Step 6: Commit**

```bash
git add src/lib/collection/components/ImportModal/tableColumns.ts \
        src/lib/collection/components/ImportModal/ImportModal.tsx \
        src/components/cards/tabs/PrintsTab.tsx
git commit -m "refactor(card-list): update consumers to import types from new type files"
```

---

## Task 8: Remove `CardListColumn` re-export from `CardList.types.ts`

Now that consumers import `CardListColumn` directly from `CardListTable.types.ts`, the inline import in `CardList.types.ts` can be cleaned up.

**Files:**

- Modify: `src/components/ui/CardList/CardList.types.ts`

- [ ] **Step 1: Remove the inline import of `CardListColumn` in `CardList.types.ts`**

The `tableColumns` prop in `CardListProps` uses an inline dynamic import — replace it with a proper top-level import:

```typescript
// src/components/ui/CardList/CardList.types.ts
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { ScryfallSortDir } from '@/components/ui/filters/SortFilter/SortFilter';
import type { CardListColumn } from '@/components/ui/CardListTable/CardListTable.types';

export type AnyCard = ScryfallCard | Card;

export interface CardListSection {
	label: string;
	cards: AnyCard[];
}

export type CardListCards = AnyCard[] | CardListSection[];

export function isSections(cards: CardListCards): cards is CardListSection[] {
	return cards.length > 0 && 'label' in (cards[0] as object);
}

export interface CardListProps {
	cards: CardListCards;
	// Pagination intégrée
	isLoading?: boolean;
	isLoadingMore?: boolean;
	hasMore?: boolean;
	onLoadMore?: () => void;
	skeletonCount?: number;
	// Interactions
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	// Table
	tableColumns?: CardListColumn[];
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
	// Grille : nombre de cartes par ligne (fixe la taille des cartes)
	cardsPerLine?: number;
	className?: string;
	pageSize?: number | false;
}
```

- [ ] **Step 2: Run full check**

```bash
cd /home/elnop/Documents/scute_swarm && npm run check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CardList/CardList.types.ts
git commit -m "refactor(card-list): clean up CardList.types.ts, use direct CardListColumn import"
```

---

## Task 9: Also clean up `cardListGridOverlayStyles` in `CardListGrid.types.ts`

The `cardListGridOverlayStyles` approach with a string placeholder in Task 4 won't work for CSS Modules — the class name must come from the imported styles object. Fix this properly.

**Files:**

- Modify: `src/components/ui/CardListGrid/CardListGrid.types.ts`
- Modify: `src/components/ui/CardListGrid/CardListGrid.tsx`

- [ ] **Step 1: Remove `cardListGridOverlayStyles` from `CardListGrid.types.ts`**

Delete the exported const from `CardListGrid.types.ts` — it was a placeholder that cannot work without the CSS module. The real export belongs in the component file.

The final `CardListGrid.types.ts` should not contain `cardListGridOverlayStyles`.

- [ ] **Step 2: Verify `CardListGrid.tsx` already exports `cardListGridStyles`**

The component file (created in Task 5) already has:

```tsx
export { styles as cardListGridStyles };
```

And `CardList.tsx` (rewritten in Task 6) already uses it:

```tsx
import { CardListGrid, cardListGridStyles } from '@/components/ui/CardListGrid/CardListGrid';
export const cardListOverlayStyles = {
	removeButton: cardListGridStyles.cardRemoveBtn,
};
```

This is correct — no change needed in `CardListGrid.tsx`.

- [ ] **Step 3: Run full check**

```bash
cd /home/elnop/Documents/scute_swarm && npm run check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/CardListGrid/CardListGrid.types.ts
git commit -m "refactor(card-list-grid): remove placeholder cardListGridOverlayStyles from types file"
```

---

## Verification

After all tasks complete, verify end-to-end:

```bash
cd /home/elnop/Documents/scute_swarm && npm run check
```

Expected output: TypeScript, ESLint, and Prettier all pass with no errors.

Spot-check visually (if dev server available):

- Collection page: grid/table toggle works, overlay remove button visible on hover
- Search page: grid/table toggle works, sort headers clickable
- PrintsTab: sections display with collapsible headers
- ImportModal: fixed 4-column grid renders correctly
