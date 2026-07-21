'use client';
import { useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { CardSearchPanel } from '@/lib/search/components/CardSearchPanel/CardSearchPanel';
import { buildSearchMenuItems } from '@/app/[locale]/search/searchCardMenu';
import { useCardMenuLabels } from '@/lib/card/hooks/useCardMenuLabels';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

type Props = {
	expanded: boolean;
	onToggleExpand: () => void;
	onClose: () => void;
};

/**
 * Card search panel wired for the collection page: left-click opens the card
 * modal, right-click shows the search-page context menu (add to
 * collection/wishlist/deck).
 */
export function CollectionSearchPanel({ expanded, onToggleExpand, onClose }: Props) {
	const router = useRouter();
	const labels = useCardMenuLabels();
	const { addCards } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const { openCardModal } = useCardModalContext();
	const { openAddCard } = useAddCardModal();
	const { openAddToDeck } = useAddToDeckModal();

	const onCardClick = useCallback(
		(card: AnyCard) => openCardModal(card as ScryfallCard),
		[openCardModal]
	);

	const buildCardMenuItems = useCallback(
		(card: AnyCard, close: () => void) =>
			buildSearchMenuItems(
				card,
				{
					onViewDetails: (c) => openCardModal(c as ScryfallCard),
					onOpenCardPage: (c) => router.push(`/card/${c.id}`),
					onAddToCollection: (c) =>
						openAddCard({
							scryfallCard: c as ScryfallCard,
							onAdd: (added, entry, count) => addCards(added, count, entry),
						}),
					onAddToWishlist: (c) =>
						openAddCard({
							scryfallCard: c as ScryfallCard,
							onAdd: (added, entry, count) => addToWishlist(added, entry, count),
						}),
					onAddToDeck: (c) => openAddToDeck(c),
				},
				close,
				labels
			),
		[router, labels, addCards, addToWishlist, openCardModal, openAddCard, openAddToDeck]
	);

	return (
		<CardSearchPanel
			mode={{ kind: 'collection', onCardClick, buildCardMenuItems }}
			onClose={onClose}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
		/>
	);
}
