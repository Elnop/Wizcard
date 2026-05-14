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

	function countCards(section: CardListSection): number {
		if (section.children && section.children.length > 0) {
			return section.children.reduce((sum, c) => sum + countCards(c), 0);
		}
		return section.cards.length;
	}

	// Calcule la largeur exacte d'une section en fonction de son contenu.
	// Pour une section avec children : somme des largeurs des enfants + gaps, sur autant de lignes que nécessaire.
	// Pour une section avec cartes : ceil(sqrt(N)) colonnes × 224px.
	const CARD_WIDTH = 200;
	const CARD_GAP = 24;
	const CARD_STEP = CARD_WIDTH + CARD_GAP; // 224px
	const SECTION_PADDING = 28; // 14px each side

	function sectionWidth(section: CardListSection): number {
		const n = countCards(section);
		if (n === 0) return CARD_WIDTH + SECTION_PADDING;
		const cols = Math.ceil(Math.sqrt(n));
		return cols * CARD_STEP - CARD_GAP + SECTION_PADDING;
	}

	// Largeur d'un container avec des children côte à côte (flex-wrap).
	// On simule le wrapping : on place les children ligne par ligne dans maxWidth,
	// et la largeur du container est le max des largeurs de ligne.
	function containerWidth(children: CardListSection[], maxWidth: number): number {
		const childWidths = children.map(sectionWidth);
		let lineWidth = 0;
		let maxLineWidth = 0;
		for (const w of childWidths) {
			const needed = lineWidth === 0 ? w : lineWidth + CARD_GAP + w;
			if (needed > maxWidth && lineWidth > 0) {
				maxLineWidth = Math.max(maxLineWidth, lineWidth);
				lineWidth = w;
			} else {
				lineWidth = needed;
			}
		}
		maxLineWidth = Math.max(maxLineWidth, lineWidth);
		return maxLineWidth;
	}

	function renderSection(
		section: CardListSection,
		idx: number,
		depth: number,
		sectionKey: string,
		isFirstTopLevel: boolean,
		parentIsFluid: boolean,
		parentWidth: number
	) {
		const collapsed = collapsedSections?.has(sectionKey) ?? false;
		const labelMatch = section.label.match(/^(.+?)\s*(\(\d+\))$/);
		const labelName = labelMatch?.[1] ?? section.label;
		const labelCount = labelMatch?.[2] ?? '';

		const isSubSection = depth > 0;

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

		const fluidWidth =
			fluidSections && (isSubSection ? parentIsFluid : true)
				? section.children && section.children.length > 0
					? containerWidth(section.children, parentWidth)
					: sectionWidth(section)
				: undefined;

		const sectionColor = !isSubSection ? section.color : undefined;
		const wrapperStyle: React.CSSProperties = {
			...(fluidWidth !== undefined ? { width: `${fluidWidth}px` } : {}),
			...(sectionColor ? { '--section-color': sectionColor } : {}),
		};

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

		const sectionBodyClass = [
			hasChildren && fluidSections ? styles.fluidSectionBody : styles.sectionBody,
		]
			.filter(Boolean)
			.join(' ');

		return (
			<div key={sectionKey} className={wrapperClass} style={wrapperStyle}>
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
										fluidSections,
										fluidWidth ?? parentWidth
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
		if (fluidSections) {
			// parentWidth = somme de toutes les largeurs + gaps (container "infini" pour le top-level)
			const totalWidth = sections.reduce(
				(sum, s, i) => sum + sectionWidth(s) + (i > 0 ? CARD_GAP : 0),
				0
			);
			return (
				<div className={styles.fluidSectionsContainer}>
					{sections.map((section, idx) =>
						renderSection(section, idx, 0, section.label, idx === 0, false, totalWidth)
					)}
				</div>
			);
		}
		return (
			<>
				{sections.map((section, idx) =>
					renderSection(section, idx, 0, section.label, idx === 0, false, 0)
				)}
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
