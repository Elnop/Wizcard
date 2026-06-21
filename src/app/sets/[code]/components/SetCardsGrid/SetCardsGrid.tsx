'use client';

import { useState, useCallback } from 'react';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { SetCompletion } from '../../utils/setCompletion';
import styles from './SetCardsGrid.module.css';

export interface SetCardsGridProps {
	setCode: string;
	completion: SetCompletion;
	/** Full print list of the set (fetched once at the page level). */
	allCards: ScryfallCard[];
	isCompletionLoading: boolean;
}

type ViewMode = 'simple' | 'collection';

export function SetCardsGrid({
	setCode,
	completion,
	allCards,
	isCompletionLoading,
}: SetCardsGridProps) {
	const { addCard } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const [selectedCard, setSelectedCard] = useState<AnyCard | null>(null);
	const [view, setView] = useState<ViewMode>('simple');

	// Paginated search powers the simple grid (loads on scroll).
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

	// Collection mode ghosts unowned prints and badges owned-foil prints.
	const renderOverlay = useCallback(
		(card: AnyCard) => {
			const status = completion.status.get(card.id);
			if (!status || !status.owned) {
				return <div className={styles.ghostVeil} aria-hidden="true" />;
			}
			return status.foil ? (
				<span className={styles.foilBadge} title="Possédée en foil">
					✦ Foil
				</span>
			) : null;
		},
		[completion]
	);

	const isCollection = view === 'collection';

	return (
		<>
			<div className={styles.viewToggle} role="tablist" aria-label="Mode d’affichage">
				<button
					type="button"
					role="tab"
					aria-selected={!isCollection}
					className={`${styles.toggleBtn} ${!isCollection ? styles.toggleBtnActive : ''}`}
					onClick={() => setView('simple')}
				>
					Simple
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={isCollection}
					className={`${styles.toggleBtn} ${isCollection ? styles.toggleBtnActive : ''}`}
					onClick={() => setView('collection')}
				>
					Collection
				</button>
			</div>

			{isCollection ? (
				<>
					<CardList
						cards={allCards}
						isLoading={isCompletionLoading && allCards.length === 0}
						onCardClick={handleCardClick}
						renderOverlay={renderOverlay}
						viewModes={['grid']}
						pageSize={false}
					/>
					{!isCompletionLoading && allCards.length === 0 && (
						<p className={styles.error}>Impossible de charger les cartes de cette extension.</p>
					)}
				</>
			) : (
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
				</>
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
