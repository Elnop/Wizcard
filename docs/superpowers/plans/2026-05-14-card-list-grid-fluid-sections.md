# CardListGrid Fluid Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une prop `fluidSections` qui permet aux sections du CardListGrid de s'afficher côte à côte en adaptant leur largeur à leur contenu naturel (fit-content + flex-wrap).

**Architecture:** Quand `fluidSections` est activé, le conteneur des sections devient un flex wrap avec `align-items: flex-start`. Chaque section reçoit `flex: 0 0 fit-content` + `min-width: 200px` — le grid interne de cartes garde son comportement `auto-fill`, le navigateur calcule la largeur naturelle sans JS. La prop traverse la chaîne `CardListProps` → `CardListGrid` → rendu conditionnel.

**Tech Stack:** React, CSS Modules, TypeScript

---

## File Map

| Fichier                                                        | Action                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/card/components/CardListGrid/CardListGrid.types.ts`   | Modify — ajouter `fluidSections?: boolean`                                       |
| `src/lib/card/components/CardListGrid/CardListGrid.module.css` | Modify — ajouter `.fluidSectionsContainer`, `.fluidSection`, `.fluidSectionBody` |
| `src/lib/card/components/CardListGrid/CardListGrid.tsx`        | Modify — wrapper conditionnel sur sections et sectionBody                        |
| `src/lib/card/components/CardList/CardList.types.ts`           | Modify — ajouter `fluidSections?: boolean` dans `CardListProps`                  |
| `src/lib/card/components/CardList/CardList.tsx`                | Modify — passer `fluidSections` à `CardListGrid`                                 |
| `src/app/decks/[id]/page.tsx`                                  | Modify — passer `fluidSections` au `CardList`                                    |
| `src/lib/card/components/CardModal/CardModal.tsx`              | Modify — passer `fluidSections` au `CardList`                                    |

---

### Task 1: Ajouter la prop `fluidSections` aux types

**Files:**

- Modify: `src/lib/card/components/CardListGrid/CardListGrid.types.ts`
- Modify: `src/lib/card/components/CardList/CardList.types.ts`

- [ ] **Step 1: Ajouter `fluidSections` dans `CardListGridProps`**

Dans `src/lib/card/components/CardListGrid/CardListGrid.types.ts`, ajouter la prop après `sectionClassName`:

```typescript
import type { ReactNode } from 'react';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';

export interface CardListGridProps {
	cards: AnyCard[];
	sections?: CardListSection[];
	isLoading?: boolean;
	isLoadingMore?: boolean;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	renderItem?: (card: AnyCard, index: number) => ReactNode;
	cardsPerLine?: number;
	collapsedSections?: Set<string>;
	onSectionToggle?: (label: string) => void;
	sectionClassName?: string;
	fluidSections?: boolean;
	className?: string;
}
```

- [ ] **Step 2: Ajouter `fluidSections` dans `CardListProps`**

Dans `src/lib/card/components/CardList/CardList.types.ts`, ajouter la prop après `sectionClassName`:

```typescript
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';

export type AnyCard = ScryfallCard | Card;

export interface CardListSection {
	label: string;
	cards: AnyCard[];
	children?: CardListSection[];
}

export type CardListCards = AnyCard[] | CardListSection[];

export function isSections(cards: CardListCards): cards is CardListSection[] {
	return cards.length > 0 && 'label' in (cards[0] as object);
}

export interface CardListProps {
	cards: CardListCards;
	isLoading?: boolean;
	isLoadingMore?: boolean;
	hasMore?: boolean;
	onLoadMore?: () => void;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	tableColumns?: CardListColumn[];
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
	cardsPerLine?: number;
	renderItem?: (card: AnyCard, index: number) => ReactNode;
	sectionClassName?: string;
	fluidSections?: boolean;
	className?: string;
	pageSize?: number | false;
}
```

- [ ] **Step 3: Vérifier TypeScript**

```bash
npm run check 2>&1 | head -30
```

Attendu : aucune erreur de type sur ces fichiers.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/CardListGrid/CardListGrid.types.ts src/lib/card/components/CardList/CardList.types.ts
git commit -m "feat(card-list-grid): add fluidSections prop to types"
```

---

### Task 2: Ajouter les classes CSS

**Files:**

- Modify: `src/lib/card/components/CardListGrid/CardListGrid.module.css`

- [ ] **Step 1: Ajouter les nouvelles classes à la fin du fichier CSS**

Ajouter après la dernière règle existante dans `src/lib/card/components/CardListGrid/CardListGrid.module.css` :

```css
/* Fluid sections layout */

.fluidSectionsContainer {
	display: flex;
	flex-wrap: wrap;
	gap: 24px;
	align-items: flex-start;
}

.fluidSection {
	flex: 0 0 fit-content;
	min-width: 200px;
	max-width: 100%;
}

.fluidSectionBody {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	align-items: flex-start;
	margin-top: 12px;
}

.fluidSubSection {
	flex: 0 0 fit-content;
	min-width: 160px;
	max-width: 100%;
	margin-top: 0;
	padding-left: 0;
}
```

- [ ] **Step 2: Vérifier aucune erreur Prettier/lint**

```bash
npm run check 2>&1 | head -20
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/components/CardListGrid/CardListGrid.module.css
git commit -m "feat(card-list-grid): add fluid sections CSS classes"
```

---

### Task 3: Implémenter le rendu fluid dans `CardListGrid.tsx`

**Files:**

- Modify: `src/lib/card/components/CardListGrid/CardListGrid.tsx`

- [ ] **Step 1: Ajouter `fluidSections` dans la destructuration et modifier le rendu**

Remplacer le contenu complet de `src/lib/card/components/CardListGrid/CardListGrid.tsx` :

```typescript
// src/components/ui/CardListGrid/CardListGrid.tsx
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { CardListGridProps } from './CardListGrid.types';
import styles from './CardListGrid.module.css';

const DEFAULT_SKELETON_COUNT = 12;

export function CardListGrid({
	cards,
	sections,
	isLoading = false,
	isLoadingMore = false,
	skeletonCount = DEFAULT_SKELETON_COUNT,
	onCardClick,
	renderOverlay,
	renderItem,
	cardsPerLine,
	collapsedSections,
	onSectionToggle,
	sectionClassName,
	fluidSections = false,
	className,
}: CardListGridProps) {
	const gridClass = [cardsPerLine ? styles.gridFixed : styles.grid, className]
		.filter(Boolean)
		.join(' ');
	const gridStyle = cardsPerLine
		? ({ '--cards-per-line': cardsPerLine } as React.CSSProperties)
		: undefined;

	function renderItems(cardItems: typeof cards, withLoadMoreSkeletons = false, priorityOffset = 0) {
		return (
			<div className={gridClass} style={gridStyle}>
				{cardItems.map((c, i) =>
					renderItem ? (
						renderItem(c, priorityOffset + i)
					) : (
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
								<CardImage card={c} size="normal" priority={priorityOffset + i < 4} />
								{renderOverlay?.(c)}
							</div>
						</div>
					)
				)}
				{withLoadMoreSkeletons &&
					isLoadingMore &&
					Array.from({ length: skeletonCount }).map((_, i) => (
						<div key={`skmore-${i}`} className={styles.item}>
							<div className={styles.skeletonName} />
							<div className={styles.skeletonImage} />
						</div>
					))}
			</div>
		);
	}

	const isCollapsible = !!onSectionToggle;

	function renderSection(
		section: CardListSection,
		idx: number,
		depth: number,
		sectionKey: string,
		isFirstTopLevel: boolean,
		parentIsFluid: boolean
	) {
		const collapsed = collapsedSections?.has(sectionKey) ?? false;
		const labelMatch = section.label.match(/^(.+?)\s*(\(\d+\))$/);
		const labelName = labelMatch?.[1] ?? section.label;
		const labelCount = labelMatch?.[2] ?? '';

		const isSubSection = depth > 0;

		// En mode fluid, les sous-sections utilisent fluidSubSection au lieu de subSectionWrapper
		const wrapperClass = [
			isSubSection
				? parentIsFluid
					? styles.fluidSubSection
					: styles.subSectionWrapper
				: isFirstTopLevel
					? styles.sectionWrapperFirst
					: styles.sectionWrapper,
			fluidSections && !isSubSection ? styles.fluidSection : undefined,
			!isSubSection ? sectionClassName : undefined,
		]
			.filter(Boolean)
			.join(' ');

		const headerClass = [
			isSubSection ? styles.subSectionHeader : styles.sectionHeader,
			isCollapsible
				? isSubSection
					? styles.subSectionHeaderCollapsible
					: styles.sectionHeaderCollapsible
				: undefined,
		]
			.filter(Boolean)
			.join(' ');

		const labelText = (
			<>
				{labelName}
				{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
			</>
		);

		const Heading = `h${Math.min(depth + 2, 6)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

		const hasChildren = section.children && section.children.length > 0;

		// Le sectionBody devient flex wrap si fluid et qu'il a des enfants
		const sectionBodyClass = [
			hasChildren && fluidSections ? styles.fluidSectionBody : styles.sectionBody,
		]
			.filter(Boolean)
			.join(' ');

		return (
			<div key={sectionKey} className={wrapperClass}>
				<Heading className={styles.sectionHeading}>
					{isCollapsible ? (
						<button
							type="button"
							className={headerClass}
							onClick={() => onSectionToggle(sectionKey)}
						>
							{labelText}
							<span
								className={[styles.chevron, collapsed ? styles.chevronCollapsed : '']
									.filter(Boolean)
									.join(' ')}
							>
								▾
							</span>
						</button>
					) : (
						<span className={headerClass}>{labelText}</span>
					)}
				</Heading>
				{!collapsed && (
					<div className={sectionBodyClass}>
						{hasChildren
							? section.children!.map((child, i) =>
									renderSection(
										child,
										i,
										depth + 1,
										`${sectionKey}::${child.label}`,
										false,
										fluidSections
									)
								)
							: renderItems(section.cards, false, isFirstTopLevel && depth === 0 ? 0 : Infinity)}
					</div>
				)}
			</div>
		);
	}

	// Sections mode
	if (sections && sections.length > 0) {
		const containerClass = fluidSections ? styles.fluidSectionsContainer : undefined;
		return (
			<div className={containerClass}>
				{sections.map((section, idx) =>
					renderSection(section, idx, 0, section.label, idx === 0, false)
				)}
			</div>
		);
	}

	// Initial skeleton
	if (isLoading && cards.length === 0) {
		return (
			<div className={gridClass} style={gridStyle}>
				{Array.from({ length: skeletonCount }).map((_, i) => (
					<div key={`sk-${i}`} className={styles.item}>
						<div className={styles.skeletonName} />
						<div className={styles.skeletonImage} />
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

- [ ] **Step 2: Vérifier TypeScript + lint**

```bash
npm run check 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/components/CardListGrid/CardListGrid.tsx
git commit -m "feat(card-list-grid): implement fluid sections layout"
```

---

### Task 4: Passer `fluidSections` à travers `CardList`

**Files:**

- Modify: `src/lib/card/components/CardList/CardList.tsx`

- [ ] **Step 1: Ajouter `fluidSections` dans la destructuration et le passer à `CardListGrid`**

Dans `src/lib/card/components/CardList/CardList.tsx`, ajouter `fluidSections` dans la destructuration des props (après `sectionClassName`) et le passer aux deux appels `<CardListGrid>` (mode sections et mode flat) :

```typescript
'use client';

import { useState } from 'react';
import type { CardListProps } from './CardList.types';
import { isSections } from './CardList.types';
import { CardListGrid } from '@/lib/card/components/CardListGrid/CardListGrid';
import { CardListTable } from '@/lib/card/components/CardListTable/CardListTable';
import { useInfiniteScroll } from './useInfiniteScroll';
import { Spinner } from '@/components/Spinner/Spinner';
import { PAGE_SIZE } from '@/lib/collection/constants';
import styles from './CardList.module.css';

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
	renderItem,
	sectionClassName,
	fluidSections,
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

	const sentinel = resolvedHasMore && resolvedLoadMore && (
		<>
			<div ref={sentinelRef} />
			<div className={styles.loaderWrapper}>
				<Spinner size="md" />
			</div>
		</>
	);

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

	// Sections mode — CardListGrid and CardListTable handle section layout
	if (sections) {
		return (
			<>
				{toggle}
				{viewMode === 'table' ? (
					<CardListTable
						cards={[]}
						columns={tableColumns ?? []}
						sections={sections}
						isLoading={isLoading}
						onCardClick={onCardClick}
						sortOrder={sortOrder}
						sortDir={sortDir}
						onSortChange={onSortChange}
						collapsedSections={collapsedSections}
						onSectionToggle={toggleSection}
					/>
				) : (
					<CardListGrid
						cards={[]}
						sections={sections}
						onCardClick={onCardClick}
						renderOverlay={renderOverlay}
						renderItem={renderItem}
						cardsPerLine={cardsPerLine}
						collapsedSections={collapsedSections}
						onSectionToggle={toggleSection}
						sectionClassName={sectionClassName}
						fluidSections={fluidSections}
						className={className}
					/>
				)}
				{sentinel}
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
					isLoading={isLoading}
					onCardClick={onCardClick}
					sortOrder={sortOrder}
					sortDir={sortDir}
					onSortChange={onSortChange}
				/>
				{sentinel}
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
				renderItem={renderItem}
				cardsPerLine={cardsPerLine}
				className={className}
			/>
			{sentinel}
		</>
	);
}
```

- [ ] **Step 2: Vérifier TypeScript + lint**

```bash
npm run check 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/components/CardList/CardList.tsx
git commit -m "feat(card-list): thread fluidSections prop to CardListGrid"
```

---

### Task 5: Activer `fluidSections` dans la deck view

**Files:**

- Modify: `src/app/decks/[id]/page.tsx`

- [ ] **Step 1: Lire le fichier pour trouver l'appel `<CardList>`**

```bash
grep -n "CardList" src/app/decks/\[id\]/page.tsx
```

Attendu : une ligne montrant `<CardList` avec son numéro de ligne.

- [ ] **Step 2: Ajouter `fluidSections` au `<CardList>` de la deck view**

Trouver le `<CardList` dans `src/app/decks/[id]/page.tsx` et ajouter la prop `fluidSections` :

```tsx
<CardList
	cards={sections}
	fluidSections
	{/* ... autres props existantes inchangées */}
/>
```

Ne modifier que la ligne du `<CardList>` — ajouter `fluidSections` comme prop booléenne sans valeur explicite.

- [ ] **Step 3: Vérifier TypeScript + lint**

```bash
npm run check 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/\[id\]/page.tsx
git commit -m "feat(deck): enable fluidSections layout in deck view"
```

---

### Task 6: Activer `fluidSections` dans la CardModal

**Files:**

- Modify: `src/lib/card/components/CardModal/CardModal.tsx`

- [ ] **Step 1: Lire la CardModal pour trouver l'appel `<CardList>`**

```bash
grep -n "CardList\|sections" src/lib/card/components/CardModal/CardModal.tsx | head -20
```

Attendu : lignes montrant les appels `<CardList>` ou `<CardListGrid>` dans la modal.

- [ ] **Step 2: Ajouter `fluidSections` au composant de liste de la modal**

Trouver l'appel `<CardList` (ou `<CardListGrid` si utilisé directement) dans `src/lib/card/components/CardModal/CardModal.tsx` et ajouter `fluidSections` :

```tsx
<CardList
	cards={sections}
	fluidSections
	{/* ... autres props existantes inchangées */}
/>
```

- [ ] **Step 3: Vérifier TypeScript + lint**

```bash
npm run check 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/CardModal/CardModal.tsx
git commit -m "feat(card-modal): enable fluidSections layout in card detail modal"
```

---

## Vérification finale

- [ ] Ouvrir la deck view → les sections Mainboard/Sideboard/Commander s'affichent côte à côte si possible
- [ ] Les sous-sections (Creatures, Instants…) s'affichent côte à côte dans leur section parent
- [ ] Replier une section → comportement inchangé
- [ ] Ouvrir une card modal avec des prints groupés → sections côte à côte
- [ ] Ouvrir la search page ou collection → layout vertical inchangé (pas de `fluidSections`)
- [ ] Redimensionner la fenêtre → le flex-wrap gère le passage à la ligne correctement

```bash
npm run check
```

Attendu : aucune erreur TypeScript, ESLint, ou Prettier.
