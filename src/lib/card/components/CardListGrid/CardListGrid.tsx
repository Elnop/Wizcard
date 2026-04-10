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
		isFirstTopLevel: boolean
	) {
		const collapsed = collapsedSections?.has(sectionKey) ?? false;
		const labelMatch = section.label.match(/^(.+?)\s*(\(\d+\))$/);
		const labelName = labelMatch?.[1] ?? section.label;
		const labelCount = labelMatch?.[2] ?? '';

		const isSubSection = depth > 0;

		const wrapperClass = [
			isSubSection
				? styles.subSectionWrapper
				: isFirstTopLevel
					? styles.sectionWrapperFirst
					: styles.sectionWrapper,
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

		const labelContent = (
			<span>
				{labelName}
				{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
			</span>
		);

		const hasChildren = section.children && section.children.length > 0;

		return (
			<div key={sectionKey} className={wrapperClass}>
				{isCollapsible ? (
					<button type="button" className={headerClass} onClick={() => onSectionToggle(sectionKey)}>
						{labelContent}
						<span
							className={[styles.chevron, collapsed ? styles.chevronCollapsed : '']
								.filter(Boolean)
								.join(' ')}
						>
							▾
						</span>
					</button>
				) : (
					<div className={headerClass}>{labelContent}</div>
				)}
				{!collapsed && (
					<div className={styles.sectionBody}>
						{hasChildren
							? section.children!.map((child, i) =>
									renderSection(child, i, depth + 1, `${sectionKey}::${child.label}`, false)
								)
							: renderItems(section.cards, false, isFirstTopLevel && depth === 0 ? 0 : Infinity)}
					</div>
				)}
			</div>
		);
	}

	// Sections mode
	if (sections && sections.length > 0) {
		return (
			<>
				{sections.map((section, idx) => renderSection(section, idx, 0, section.label, idx === 0))}
			</>
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
