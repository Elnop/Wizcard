'use client';

// src/components/ui/CardListGrid/CardListGrid.tsx
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { Spinner } from '@/components/Spinner/Spinner';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { sectionKey } from '@/lib/card/components/CardList/section-key';
import { cardKey } from '@/lib/card/utils/card-key';
import type { CardListGridProps } from './CardListGrid.types';
import styles from './CardListGrid.module.css';

const DEFAULT_SKELETON_COUNT = 12;
const PRIORITY_CARD_COUNT = 4;

function getSectionWrapperBase(
	isSubSection: boolean,
	isFirstTopLevel: boolean,
	parentIsFluid: boolean
): string {
	if (isSubSection) return parentIsFluid ? styles.fluidSubSection : styles.subSectionWrapper;
	return isFirstTopLevel ? styles.sectionWrapperFirst : styles.sectionWrapper;
}

function getSectionWrapperClass(
	isSubSection: boolean,
	isFirstTopLevel: boolean,
	parentIsFluid: boolean,
	isFluid: boolean,
	hasChildren: boolean,
	collapsed: boolean,
	sectionClassName: string | undefined
): string {
	const base = getSectionWrapperBase(isSubSection, isFirstTopLevel, parentIsFluid);
	let fluidVariant: string | undefined;
	if (isFluid) {
		fluidVariant = hasChildren ? styles.fluidSectionParent : styles.fluidSection;
	}
	return [
		base,
		fluidVariant,
		isFluid && collapsed ? styles.fluidSectionCollapsed : undefined,
		!isSubSection ? sectionClassName : undefined,
	]
		.filter(Boolean)
		.join(' ');
}

function getSectionHeaderClass(isSubSection: boolean, isCollapsible: boolean): string {
	const base = isSubSection ? styles.subSectionHeader : styles.sectionHeader;
	let collapsible: string | undefined;
	if (isCollapsible) {
		collapsible = isSubSection
			? styles.subSectionHeaderCollapsible
			: styles.sectionHeaderCollapsible;
	}
	return [base, collapsible].filter(Boolean).join(' ');
}

function getSectionBodyClass(
	isFluid: boolean,
	hasChildren: boolean,
	showBorder: boolean,
	showBg: boolean,
	sectionColor: string | undefined
): string {
	let base: string;
	if (isFluid) {
		base = hasChildren ? styles.fluidSectionBody : styles.fluidSectionBodyCards;
	} else {
		base = styles.sectionBody;
	}
	return [
		base,
		isFluid && showBorder ? styles.fluidSectionBodyBorder : undefined,
		showBg && sectionColor ? styles.sectionBodyColoredBg : undefined,
		isFluid && showBg ? styles.fluidSectionBodyBg : undefined,
	]
		.filter(Boolean)
		.join(' ');
}

function resolveSectionClasses(
	section: CardListSection,
	depth: number,
	isFirstTopLevel: boolean,
	parentIsFluid: boolean,
	collapsed: boolean,
	fluidSections: boolean,
	isCollapsible: boolean,
	sectionClassName: string | undefined
) {
	const isSubSection = depth > 0;
	const isFluid = fluidSections && (!isSubSection || parentIsFluid);
	const hasChildren = !!(section.children && section.children.length > 0);
	const showBorder = section.border ?? true;
	const showBg = section.background ?? true;
	const sectionColor = section.color;

	return {
		isFluid,
		hasChildren,
		wrapperClass: getSectionWrapperClass(
			isSubSection,
			isFirstTopLevel,
			parentIsFluid,
			isFluid,
			hasChildren,
			collapsed,
			sectionClassName
		),
		headerClass: getSectionHeaderClass(isSubSection, isCollapsible),
		sectionBodyClass: getSectionBodyClass(isFluid, hasChildren, showBorder, showBg, sectionColor),
		headingClass: [
			styles.sectionHeading,
			showBg && sectionColor ? styles.sectionHeadingColoredBg : undefined,
		]
			.filter(Boolean)
			.join(' '),
		wrapperStyle: (sectionColor ? { '--section-color': sectionColor } : {}) as React.CSSProperties,
	};
}

export function CardListGrid({
	cards,
	sections,
	isLoading = false,
	isLoadingMore = false,
	skeletonCount = DEFAULT_SKELETON_COUNT,
	onCardClick,
	buildCardMenuItems,
	onCardContextMenu,
	renderOverlay,
	renderItem,
	cardsPerLine,
	collapsedSections,
	onSectionToggle,
	sectionClassName,
	fluidSections = false,
	className,
	showCardNames = false,
	cardGap = 'default',
}: CardListGridProps) {
	const cardMenu = useContextMenu<AnyCard>();

	function handleCardContextMenu(card: AnyCard, e: React.MouseEvent) {
		if (buildCardMenuItems) {
			const items = buildCardMenuItems(card, cardMenu.close);
			if (items && items.length > 0) cardMenu.open(card, e);
			return;
		}
		onCardContextMenu?.(card, e);
	}

	const hasCardMenu = !!buildCardMenuItems || !!onCardContextMenu;

	function renderDefaultCardItem(c: AnyCard, priorityIndex: number) {
		const isPriority = priorityIndex < PRIORITY_CARD_COUNT;
		return (
			<div
				key={cardKey(c)}
				className={[styles.item, onCardClick ? styles.itemClickable : undefined]
					.filter(Boolean)
					.join(' ')}
				title={c.name}
				onClick={onCardClick ? () => onCardClick(c) : undefined}
				onContextMenu={hasCardMenu ? (e) => handleCardContextMenu(c, e) : undefined}
			>
				{showCardNames && <p className={styles.cardName}>{c.name}</p>}
				<div className={styles.imageWrapper}>
					<CardImage
						card={c}
						// Grid cells render ~150-200px wide (see .grid in
						// CardListGrid.module.css); `normal` (488x680) is ~2.5-3x more
						// resolution than needed there. Keep `normal` only for the
						// handful of above-the-fold priority cards so they stay crisp;
						// everything else downloads the much lighter `small` (146x204)
						// source.
						size={isPriority ? 'normal' : 'small'}
						priority={isPriority}
						isFoil={'entry' in c ? c.entry.isFoil : undefined}
						foilType={'entry' in c ? c.entry.foilType : undefined}
						isProxy={'entry' in c ? c.entry.proxy : undefined}
					/>
					{renderOverlay?.(c)}
				</div>
			</div>
		);
	}

	const gridClass = [cardsPerLine ? styles.gridFixed : styles.grid, className]
		.filter(Boolean)
		.join(' ');
	const gridStyle = cardsPerLine
		? ({ '--cards-per-line': cardsPerLine } as React.CSSProperties)
		: undefined;
	const effectiveGridClass =
		cardGap === 'compact' ? `${gridClass} ${styles.gridCompact}` : gridClass;

	function renderItems(
		cardItems: typeof cards,
		withLoadMoreSkeletons = false,
		priorityOffset = 0,
		fluid = false
	) {
		let itemClass: string;
		if (fluid) {
			itemClass =
				cardGap === 'compact'
					? `${styles.fluidItemGrid} ${styles.fluidItemGridCompact}`
					: styles.fluidItemGrid;
		} else {
			itemClass = cardGap === 'compact' ? `${gridClass} ${styles.gridCompact}` : gridClass;
		}
		return (
			<div className={itemClass} style={fluid ? undefined : gridStyle}>
				{cardItems.map((c, i) =>
					renderItem
						? renderItem(c, priorityOffset + i)
						: renderDefaultCardItem(c, priorityOffset + i)
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

	function renderSectionHeading(
		sectionKey: string,
		headerClass: string,
		headingClass: string,
		depth: number,
		collapsed: boolean,
		labelText: React.ReactNode,
		headerActions?: React.ReactNode
	) {
		const Heading = `h${Math.min(depth + 2, 6)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
		const chevronClass = [styles.chevron, collapsed ? styles.chevronCollapsed : '']
			.filter(Boolean)
			.join(' ');
		const heading = isCollapsible ? (
			<button type="button" className={headerClass} onClick={() => onSectionToggle(sectionKey)}>
				<span className={chevronClass}>▾</span>
				{labelText}
			</button>
		) : (
			<span className={headerClass}>{labelText}</span>
		);
		if (!headerActions) {
			return <Heading className={headingClass}>{heading}</Heading>;
		}
		return (
			<Heading className={`${headingClass} ${styles.sectionHeadingWithActions}`}>
				{heading}
				<span className={styles.sectionHeaderActions}>{headerActions}</span>
			</Heading>
		);
	}

	function renderSectionContent(
		section: CardListSection,
		depth: number,
		parentKey: string,
		priorityOffset: number,
		isFluid: boolean,
		hasChildren: boolean,
		isFirstTopLevel: boolean
	) {
		if (section.loading) {
			return (
				<div className={styles.sectionLoader}>
					<Spinner size="sm" />
				</div>
			);
		}
		if (hasChildren) {
			return section.children!.map((child, i) =>
				renderSection(
					child,
					i,
					depth + 1,
					`${parentKey}::${sectionKey(child)}`,
					// Only the first child of the first top-level section stays on the
					// priority-eligible path — everything else (later children, deeper
					// nesting) falls back to no priority.
					isFirstTopLevel && i === 0,
					fluidSections
				)
			);
		}
		return renderItems(section.cards, false, priorityOffset, isFluid);
	}

	function renderSection(
		section: CardListSection,
		idx: number,
		depth: number,
		keyForSection: string,
		isFirstTopLevel: boolean,
		parentIsFluid: boolean
	) {
		const collapsed = collapsedSections?.has(keyForSection) ?? false;
		// Labels are built as `${name} (${count})` with a single space, so a greedy
		// anchored pattern splits them without the super-linear backtracking of `.+?\s*`.
		const labelMatch = section.label.match(/^(.+) (\(\d+\))$/);
		const labelName = labelMatch?.[1] ?? section.label;
		const labelCount = labelMatch?.[2] ?? '';

		const {
			isFluid,
			hasChildren,
			wrapperClass,
			headerClass,
			sectionBodyClass,
			headingClass,
			wrapperStyle,
		} = resolveSectionClasses(
			section,
			depth,
			isFirstTopLevel,
			parentIsFluid,
			collapsed,
			fluidSections,
			isCollapsible,
			sectionClassName
		);

		const labelText = (
			<>
				{labelName}
				{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
			</>
		);

		// Priority-eligible path: the first top-level section, followed down through
		// only its first child at each depth (e.g. Commander/Mainboard's first
		// sub-section). Any section off that path renders with no priority images.
		const priorityOffset = isFirstTopLevel ? 0 : Infinity;

		return (
			<div key={keyForSection} className={wrapperClass} style={wrapperStyle}>
				{renderSectionHeading(
					keyForSection,
					headerClass,
					headingClass,
					depth,
					collapsed,
					labelText,
					section.headerActions
				)}
				{!collapsed && (
					<div className={sectionBodyClass}>
						{renderSectionContent(
							section,
							depth,
							keyForSection,
							priorityOffset,
							isFluid,
							hasChildren,
							isFirstTopLevel
						)}
					</div>
				)}
			</div>
		);
	}

	function renderContent() {
		// Sections mode
		if (sections && sections.length > 0) {
			if (fluidSections) {
				return (
					<div className={[styles.fluidSectionsContainer, className].filter(Boolean).join(' ')}>
						{sections.map((section, idx) =>
							renderSection(section, idx, 0, sectionKey(section), idx === 0, false)
						)}
					</div>
				);
			}
			return (
				<div className={className}>
					{sections.map((section, idx) =>
						renderSection(section, idx, 0, section.label, idx === 0, false)
					)}
				</div>
			);
		}

		// Initial skeleton
		if (isLoading && cards.length === 0) {
			return (
				<div className={effectiveGridClass} style={gridStyle}>
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

	const menuItems = cardMenu.menu
		? (buildCardMenuItems?.(cardMenu.menu.data, cardMenu.close) ?? [])
		: [];

	return (
		<>
			{renderContent()}
			{cardMenu.menu && menuItems.length > 0 && (
				<ContextMenu items={menuItems} position={cardMenu.menu.position} onClose={cardMenu.close} />
			)}
		</>
	);
}
