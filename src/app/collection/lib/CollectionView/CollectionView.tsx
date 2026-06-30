'use client';

import { useMemo, type ReactNode } from 'react';
import type { CardStack } from '@/types/cards';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { useCollectionFiltering } from './useCollectionFiltering';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { CollectionFiltersAside } from './CollectionFiltersAside/CollectionFiltersAside';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import { DeckBadge } from '@/lib/card/components/DeckBadge/DeckBadge';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import styles from './CollectionView.module.css';

type Props = {
	/** Hydrated, grouped stacks (from useCollectionCards in the parent). */
	stacks: CardStack[];
	/** Number of raw entries (drives empty-state and skeleton count). */
	entryCount: number;
	/** Scryfall hydration in progress (from useCollectionCards). */
	isHydrating: boolean;
	/** Total entries expected (skeleton count hint). */
	totalExpected: number;
	/** True once the first page of entries has been received. */
	isLoaded: boolean;
	/** True once every page has been received (grid stays frozen until then). */
	isFullyLoaded: boolean;
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
	/** Show a "in a deck" badge on cards whose copies are assigned to a deck (owner view only). */
	showDeckBadges?: boolean;
	/** Modal(s) rendered as a sibling of the layout (owner edit / read-only view). */
	children?: ReactNode;
};

/**
 * Shared, owner-agnostic presentation of a collection: filters aside + stats +
 * card grid. Hydration (Scryfall) and filtering are driven entirely by the
 * `entries` prop, so this renders identically for the owner page and the public
 * `/users/[userId]/collection` page. Editing affordances live in the parent via
 * the `actions`/`children` slots.
 */
export function CollectionView({
	stacks,
	entryCount,
	isHydrating,
	totalExpected,
	isLoaded,
	isFullyLoaded,
	title,
	actions,
	emptyState,
	onCardClick,
	buildCardMenuItems,
	showDeckBadges = false,
	children,
}: Props) {
	// The collection loads in two stages: entries arrive page by page from
	// Supabase, then each card is hydrated from Scryfall. We only consider loading
	// done when BOTH are finished, otherwise the revealed grid keeps pushing cards.
	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const { filters, setFilters, sets, setsLoading, filteredStacks, stats, activeFilterCount } =
		useCollectionFiltering(stacks);

	// Freeze the grid on skeletons while loading: don't reveal real cards until
	// everything is loaded/sorted, otherwise cards jump as data arrives.
	const skeletonCount = isLoadingCollection
		? Math.min(PAGE_SIZE, Math.max(1, totalExpected ?? PAGE_SIZE))
		: 0;

	const representativeCards = useMemo(
		() =>
			filteredStacks
				.map((stack) => stack.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[filteredStacks]
	);

	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of filteredStacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [filteredStacks]);

	let body: ReactNode;
	if (isLoaded && entryCount === 0) {
		body = emptyState ?? null;
	} else if (isLoadingCollection) {
		body = (
			<CardList
				cards={[]}
				isLoading
				skeletonCount={skeletonCount || undefined}
				viewModes={['grid']}
			/>
		);
	} else {
		body = (
			<CardList
				cards={representativeCards}
				isLoading={false}
				onCardClick={
					onCardClick
						? (card: AnyCard) => {
								const stack = stackByCardId.get(card.id);
								if (stack) onCardClick(stack);
							}
						: undefined
				}
				buildCardMenuItems={
					buildCardMenuItems
						? (card: AnyCard, close: () => void) => {
								const stack = stackByCardId.get(card.id);
								return stack ? buildCardMenuItems(stack, close) : null;
							}
						: undefined
				}
				renderOverlay={(card) => {
					const stack = stackByCardId.get(card.id);
					const count = stack?.cards.length ?? 1;
					const countBadge =
						count > 1 ? <span className={styles.cardBadge}>x{count}</span> : undefined;
					const deckBadge = showDeckBadges && stack ? <DeckBadge cards={stack.cards} /> : undefined;
					return withCustomBadge(
						card,
						<>
							{deckBadge}
							{countBadge}
						</>
					);
				}}
				sortOrder={filters.order}
				sortDir={filters.dir}
				onSortChange={(newOrder, newDir) =>
					setFilters({
						...filters,
						order: newOrder as CollectionFilters['order'],
						dir: newDir,
					})
				}
				tableColumns={[
					{
						key: 'qty',
						label: 'Qty',
						render: (card) => stackByCardId.get(card.id)?.cards.length ?? 1,
					},
					{ key: 'name', label: 'Name', sortKey: 'name' },
					{
						key: 'set',
						label: 'Set',
						sortKey: 'set',
						render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
					},
					{
						key: 'collector_number',
						label: 'Collector #',
						render: (card) =>
							'collector_number' in card ? (card.collector_number as string) : '—',
					},
					{
						key: 'condition',
						label: 'Condition',
						render: (card) => ('entry' in card ? (card.entry.condition ?? '—') : '—'),
					},
					{
						key: 'foil',
						label: 'Foil',
						render: (card) => ('entry' in card ? (card.entry.foilType ?? '—') : '—'),
					},
					{
						key: 'language',
						label: 'Language',
						sortKey: 'language',
						render: (card) => ('entry' in card ? (card.entry.language ?? '—') : '—'),
					},
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
		);
	}

	return (
		<div className={styles.page}>
			<div className={styles.layout}>
				<CollectionFiltersAside
					filters={filters}
					onChange={setFilters}
					sets={sets}
					setsLoading={setsLoading}
					activeFilterCount={activeFilterCount}
				/>

				<main className={styles.main}>
					<div className={styles.titleSection}>
						<div className={styles.titleLeft}>
							<h1 className={styles.title}>{title}</h1>
							{entryCount > 0 && !isLoadingCollection && (
								<p className={styles.statsLine}>
									{stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''} &middot;{' '}
									{stats.uniqueCards} unique &middot; {stats.setCount} set
									{stats.setCount !== 1 ? 's' : ''}
								</p>
							)}
						</div>
						{actions && <div className={styles.actions}>{actions}</div>}
					</div>

					{body}
				</main>
			</div>

			{children}
		</div>
	);
}
