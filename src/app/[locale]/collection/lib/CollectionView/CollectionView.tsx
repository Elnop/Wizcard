'use client';

import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { CardStack } from '@/types/cards';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { CollectionFiltersAside } from './CollectionFiltersAside/CollectionFiltersAside';
import { CollectionFiltersBar } from './CollectionFiltersBar/CollectionFiltersBar';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { cardKey } from '@/lib/card/utils/card-key';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import { DeckBadge } from '@/lib/card/components/DeckBadge/DeckBadge';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { Button } from '@/components/Button/Button';
import type { CollectionModel } from '@/lib/collection-index/collection-model';
import { BulkSelectOverlay } from '@/lib/card/bulk/BulkSelectOverlay';
import styles from './CollectionView.module.css';

type Props = {
	/** View model: filters, sets, stats and the current page of stacks. */
	model: CollectionModel;
	/** Number of raw entries (drives empty-state and skeleton count). */
	entryCount: number;
	/** True once the first page of entries has been received. */
	isLoaded: boolean;
	/** Heading shown above the grid. */
	title: string;
	/** Action buttons (Import/Clear/Export…) rendered in the header. */
	actions?: ReactNode;
	/** Empty-state node when there are no entries. */
	emptyState?: ReactNode;
	/** Opens when a card is clicked. */
	onCardClick?: (stack: CardStack) => void;
	/** Builds the right-click menu items for a card's stack (owner view only). */
	buildCardMenuItems?: (stack: CardStack, close: () => void) => ContextMenuAction[] | null;
	/** Controls rendered on the card list toolbar row (e.g. the stacking menu). */
	toolbarExtra?: ReactNode;
	/** Show a "in a deck" badge on cards whose copies are assigned to a deck (owner view only). */
	showDeckBadges?: boolean;
	/**
	 * Filter presentation: `'aside'` (default) renders the sidebar; `'modal'`
	 * renders a search bar + filter button that opens the FilterModal, suited to
	 * narrow embeds like the profile tabs.
	 */
	filterLayout?: 'aside' | 'modal';
	/** Reflow the grid to make room for the fixed side search panel (desktop). */
	panelOpen?: boolean;
	/**
	 * Bulk selection mode (owner only). While `active`, a tile click toggles its
	 * stack (keyed by `stack.key`), the context menu is off and tiles show a
	 * check overlay.
	 */
	selection?: {
		active: boolean;
		isSelected: (stackKey: string) => boolean;
		toggle: (stackKey: string) => void;
	};
	/** Modal(s) rendered as a sibling of the layout (owner edit / read-only view). */
	children?: ReactNode;
};

type Selection = NonNullable<Props['selection']>;
type StackLookup = Map<string, CardStack>;

/** Selection mode turns a tile click into a stack toggle; otherwise the normal click. */
function cardClickHandler(
	stacks: StackLookup,
	selection: Selection | undefined,
	onCardClick: Props['onCardClick']
): ((card: AnyCard) => void) | undefined {
	if (selection?.active) {
		return (card) => {
			const stack = stacks.get(cardKey(card));
			if (stack) selection.toggle(stack.key);
		};
	}
	if (!onCardClick) return undefined;
	return (card) => {
		const stack = stacks.get(cardKey(card));
		if (stack) onCardClick(stack);
	};
}

/** The context menu is off while selecting. */
function cardMenuBuilder(
	stacks: StackLookup,
	selection: Selection | undefined,
	buildCardMenuItems: Props['buildCardMenuItems']
): ((card: AnyCard, close: () => void) => ContextMenuAction[] | null) | undefined {
	if (!buildCardMenuItems || selection?.active) return undefined;
	return (card, close) => {
		const stack = stacks.get(cardKey(card));
		return stack ? buildCardMenuItems(stack, close) : null;
	};
}

function cardOverlayRenderer(
	stacks: StackLookup,
	selection: Selection | undefined,
	showDeckBadges: boolean,
	badgeClass: string
) {
	return (card: AnyCard) => {
		const stack = stacks.get(cardKey(card));
		const count = stack?.cards.length ?? 1;
		const countBadge = count > 1 ? <span className={badgeClass}>x{count}</span> : undefined;
		if (selection?.active && stack) {
			return withCustomBadge(
				card,
				<>
					<BulkSelectOverlay checked={selection.isSelected(stack.key)} />
					{countBadge}
				</>
			);
		}
		const deckBadge = showDeckBadges && stack ? <DeckBadge cards={stack.cards} /> : undefined;
		return withCustomBadge(
			card,
			<>
				{deckBadge}
				{countBadge}
			</>
		);
	};
}

/**
 * Shared, owner-agnostic presentation of a collection: filters aside + stats +
 * card grid. Hydration (Scryfall) and filtering are driven entirely by the
 * `entries` prop, so this renders identically for the owner page and the public
 * `/users/[userId]/collection` page. Editing affordances live in the parent via
 * the `actions`/`children` slots.
 */
export function CollectionView({
	model,
	entryCount,
	isLoaded,
	title,
	actions,
	emptyState,
	onCardClick,
	buildCardMenuItems,
	toolbarExtra,
	showDeckBadges = false,
	filterLayout = 'aside',
	panelOpen = false,
	selection,
	children,
}: Props) {
	const t = useTranslations('collection');
	const tError = useTranslations('error');
	const { filters, setFilters, sets, setsLoading, stats, activeFilterCount, visibleStacks } = model;
	const skeletonCount = Math.min(PAGE_SIZE, Math.max(1, entryCount));

	const representativeCards = useMemo(
		() =>
			visibleStacks
				.map((stack) => stack.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[visibleStacks]
	);

	// Look stacks up by their representative's rowId: several stacks can share
	// one print id once stacking is finer than by-name (e.g. foil vs non-foil).
	const stackByRowId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of visibleStacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.entry.rowId, stack);
		}
		return map;
	}, [visibleStacks]);

	const errorBox = model.error && (
		<div className={styles.loadError} role="alert">
			<p>{t('loadError')}</p>
			<Button variant="secondary" onClick={model.retry}>
				{tError('retry')}
			</Button>
		</div>
	);

	// Loading and loaded share ONE CardList element: a filter change re-enters the
	// loading state, and swapping to a separate skeleton CardList would unmount the
	// list and reset its local view mode (table → grid).
	const isSkeleton = model.isInitialLoading || (!isLoaded && entryCount === 0);

	let body: ReactNode;
	if (isLoaded && entryCount === 0) {
		body = emptyState ?? null;
	} else if (!isSkeleton && model.error && visibleStacks.length === 0) {
		body = errorBox;
	} else {
		body = (
			<>
				<CardList
					cards={isSkeleton ? [] : representativeCards}
					viewModes={selection?.active ? ['grid'] : ['grid', 'table']}
					isLoading={isSkeleton}
					skeletonCount={skeletonCount}
					pageSize={false}
					hasMore={!isSkeleton && model.hasMore && !model.error}
					onLoadMore={model.loadMore}
					isLoadingMore={model.isLoadingMore}
					toolbarExtra={toolbarExtra}
					onCardClick={cardClickHandler(stackByRowId, selection, onCardClick)}
					buildCardMenuItems={cardMenuBuilder(stackByRowId, selection, buildCardMenuItems)}
					renderOverlay={cardOverlayRenderer(
						stackByRowId,
						selection,
						showDeckBadges,
						styles.cardBadge
					)}
					sortOrder={filters.order}
					sortDir={filters.dir}
					onSortChange={(newOrder, newDir) =>
						setFilters({
							...filters,
							order: newOrder as CollectionFilters['order'],
							// Switching TO quantity starts at "most copies first"; later
							// clicks on the same column toggle as usual.
							dir: newOrder === 'quantity' && filters.order !== 'quantity' ? 'desc' : newDir,
						})
					}
					tableColumns={[
						{
							key: 'qty',
							label: t('colQty'),
							sortKey: 'quantity',
							render: (card) => stackByRowId.get(cardKey(card))?.cards.length ?? 1,
						},
						{ key: 'name', label: t('colName'), sortKey: 'name' },
						{
							key: 'set',
							label: t('colSet'),
							sortKey: 'set',
							render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
						},
						{
							key: 'collector_number',
							label: t('colCollector'),
							render: (card) =>
								'collector_number' in card ? (card.collector_number as string) : '—',
						},
						{
							key: 'condition',
							label: t('colCondition'),
							render: (card) => ('entry' in card ? (card.entry.condition ?? '—') : '—'),
						},
						{
							key: 'foil',
							label: t('colFoil'),
							render: (card) => ('entry' in card ? (card.entry.foilType ?? '—') : '—'),
						},
						{
							key: 'language',
							label: t('colLanguage'),
							sortKey: 'language',
							render: (card) => ('entry' in card ? (card.entry.language ?? '—') : '—'),
						},
						{
							key: 'prices',
							label: t('colPriceUsd'),
							sortKey: 'usd',
							render: (card) =>
								'prices' in card && card.prices && 'usd' in card.prices
									? (card.prices.usd ?? '—')
									: '—',
						},
					]}
				/>
				{!isSkeleton && errorBox}
			</>
		);
	}

	const isModal = filterLayout === 'modal';
	const pageClass = [styles.page, isModal && styles.pageModal].filter(Boolean).join(' ');
	const layoutClass = [styles.layout, isModal && styles.layoutModal].filter(Boolean).join(' ');
	const mainClass = [styles.main, isModal && styles.mainModal, panelOpen && styles.mainWithPanel]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={pageClass}>
			<div className={layoutClass}>
				{!isModal && (
					<CollectionFiltersAside
						filters={filters}
						onChange={setFilters}
						sets={sets}
						setsLoading={setsLoading}
						activeFilterCount={activeFilterCount}
					/>
				)}

				<main className={mainClass}>
					<div className={styles.titleSection}>
						<div className={styles.titleLeft}>
							<h1 className={styles.title}>{title}</h1>
							{entryCount > 0 && (!model.isInitialLoading || model.stats.totalCards > 0) && (
								<p className={styles.statsLine}>
									{t('stats', {
										cards: stats.totalCards,
										unique: stats.uniqueCards,
										sets: stats.setCount,
									})}
								</p>
							)}
						</div>
						{actions && <div className={styles.actions}>{actions}</div>}
					</div>

					{isModal && (
						<CollectionFiltersBar
							filters={filters}
							onChange={setFilters}
							sets={sets}
							setsLoading={setsLoading}
							activeFilterCount={activeFilterCount}
						/>
					)}

					{body}
				</main>
			</div>

			{children}
		</div>
	);
}
