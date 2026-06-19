'use client';

import { useState, useCallback } from 'react';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import styles from './SetCardsGrid.module.css';

export interface SetCardsGridProps {
	setCode: string;
}

export function SetCardsGrid({ setCode }: SetCardsGridProps) {
	const { addCard } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const [selectedCard, setSelectedCard] = useState<AnyCard | null>(null);

	const { cards, isLoading, isLoadingMore, error, hasMore, loadMore } = useScryfallCardSearch({
		name: '',
		colors: [],
		type: [],
		set: setCode,
		rarities: [],
		oracleText: '',
		cmc: '',
		order: 'set',
		dir: 'asc',
	});

	const handleCardClick = useCallback((card: AnyCard) => setSelectedCard(card), []);

	return (
		<>
			<CardList
				cards={cards}
				isLoading={isLoading}
				isLoadingMore={isLoadingMore}
				hasMore={hasMore}
				onLoadMore={loadMore}
				onCardClick={handleCardClick}
				viewModes={['grid']}
				pageSize={false}
			/>

			{error && !isLoading && cards.length === 0 && (
				<p className={styles.error}>Impossible de charger les cartes de cette extension.</p>
			)}

			{selectedCard && (
				<CardModal
					cards={selectedCard}
					onClose={() => setSelectedCard(null)}
					onAddToCollection={(card, entry) => {
						addCard(card, entry);
					}}
					onAddToWishlist={(card, entry) => {
						addToWishlist(card, entry);
					}}
				/>
			)}
		</>
	);
}
