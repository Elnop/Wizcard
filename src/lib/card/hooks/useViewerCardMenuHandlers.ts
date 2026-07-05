'use client';

import { useMemo } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import type { ViewerCardMenuHandlers } from '@/lib/card/viewerCardMenu';

/**
 * Handlers for the "viewer" card menu (another user's profile): every action
 * targets the *signed-in user's own* collection/wishlist/deck, taking the
 * clicked card as a plain Scryfall card. Mirrors the search page's viewer wiring
 * (`src/app/search/page.tsx`) so the two stay identical. `onViewDetails` opens
 * the modal read-only (the card belongs to someone else).
 */
export function useViewerCardMenuHandlers(): ViewerCardMenuHandlers {
	const { addCards } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const { openAddToDeck } = useAddToDeckModal();
	const { openAddCard } = useAddCardModal();
	const { openCardModal } = useCardModalContext();

	return useMemo<ViewerCardMenuHandlers>(
		() => ({
			onViewDetails: (c: AnyCard) => openCardModal(c as ScryfallCard, { readOnly: true }),
			onAddToCollection: (c: AnyCard) =>
				openAddCard({
					scryfallCard: c as ScryfallCard,
					onAdd: (card, entry, count) => addCards(card, count, entry),
				}),
			onAddToWishlist: (c: AnyCard) =>
				openAddCard({
					scryfallCard: c as ScryfallCard,
					onAdd: (card, entry, count) => addToWishlist(card, entry, count),
				}),
			onAddToDeck: (c: AnyCard) => openAddToDeck(c),
		}),
		[addCards, addToWishlist, openAddToDeck, openAddCard, openCardModal]
	);
}
