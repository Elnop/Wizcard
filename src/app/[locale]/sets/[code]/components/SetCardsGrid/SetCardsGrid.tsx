'use client';

import { memo, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
import type { BadgeState } from '@/app/[locale]/decks/[id]/components/DeckCardOverlay/useCollectionBadge';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import styles from './SetCardsGrid.module.css';

export interface SetCardsGridProps {
	/** Cards to render (already filtered/sorted by the parent). */
	cards: ScryfallCard[];
	isLoading: boolean;
	sortOrder: ScryfallSortOrder;
	sortDir: ScryfallSortDir;
	onSortChange: (order: ScryfallSortOrder, dir: ScryfallSortDir) => void;
}

function SetCardsGridInner({
	cards,
	isLoading,
	sortOrder,
	sortDir,
	onSortChange,
}: SetCardsGridProps) {
	const t = useTranslations('sets');
	const { getOwnership } = useCollectionContext();
	const { entries: wishlistEntries } = useWishlistContext();
	const { openCardModal } = useCardModalContext();

	const handleCardClick = useCallback(
		(card: AnyCard) => openCardModal(card as ScryfallCard),
		[openCardModal]
	);

	// Prints present in the wishlist, for the 🛒 badge state.
	const wishlistPrintIds = useMemo(
		() => new Set(wishlistEntries.map((e) => e.scryfallId)),
		[wishlistEntries]
	);

	// Same ownership badge as deck cards / the card modal: ✓ owned, 🛒 wishlist,
	// grey otherwise. No foil badge here — unified with the rest of the app.
	const renderOverlay = useCallback(
		(card: AnyCard) => {
			let badgeState: BadgeState = 'none';
			if (getOwnership(card.id).total > 0) badgeState = 'owned';
			else if (wishlistPrintIds.has(card.id)) badgeState = 'wishlist';
			return <OwnershipBadge badgeState={badgeState} />;
		},
		[getOwnership, wishlistPrintIds]
	);

	return (
		<>
			<CardList
				cards={cards}
				isLoading={isLoading && cards.length === 0}
				onCardClick={handleCardClick}
				renderOverlay={renderOverlay}
				viewModes={['grid']}
				pageSize={false}
				sortOrder={sortOrder}
				sortDir={sortDir}
				onSortChange={(order, dir) => onSortChange(order as ScryfallSortOrder, dir)}
			/>
			{!isLoading && cards.length === 0 && <p className={styles.error}>{t('noCardMatch')}</p>}
		</>
	);
}

// Memoized: the tab strip above re-renders on scroll/drag, but the grid only
// needs to re-render when its own props change — otherwise cards flicker.
export const SetCardsGrid = memo(SetCardsGridInner);
