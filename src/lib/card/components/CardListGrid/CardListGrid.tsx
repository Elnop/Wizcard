// src/components/ui/CardListGrid/CardListGrid.tsx
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
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
							<div className={styles.skeletonName} />
							<div className={styles.skeletonImage} />
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
