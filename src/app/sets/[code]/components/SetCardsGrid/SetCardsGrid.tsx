'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
import type { BadgeState } from '@/app/decks/[id]/components/DeckCardOverlay/useCollectionBadge';
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
	const { addCards, getOwnership } = useCollectionContext();
	const { addToWishlist, entries: wishlistEntries } = useWishlistContext();
	const [selectedCard, setSelectedCard] = useState<AnyCard | null>(null);

	const handleCardClick = useCallback((card: AnyCard) => setSelectedCard(card), []);

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
			{!isLoading && cards.length === 0 && (
				<p className={styles.error}>Aucune carte ne correspond aux filtres.</p>
			)}

			{selectedCard && (
				<CardModal
					cards={selectedCard}
					onClose={() => setSelectedCard(null)}
					onAddToCollection={(card, entry, count) => {
						addCards(card, count, entry);
					}}
					onAddToWishlist={(card, entry, count) => {
						addToWishlist(card, entry, count);
					}}
				/>
			)}
		</>
	);
}

// Memoized: the tab strip above re-renders on scroll/drag, but the grid only
// needs to re-render when its own props change — otherwise cards flicker.
export const SetCardsGrid = memo(SetCardsGridInner);
