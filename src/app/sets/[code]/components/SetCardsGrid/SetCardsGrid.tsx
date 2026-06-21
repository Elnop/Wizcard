'use client';

import { memo, useState, useCallback } from 'react';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { SetCompletion } from '../../utils/setCompletion';
import styles from './SetCardsGrid.module.css';

export interface SetCardsGridProps {
	completion: SetCompletion;
	/** Cards to render (already filtered/sorted by the parent). */
	cards: ScryfallCard[];
	isLoading: boolean;
	sortOrder: ScryfallSortOrder;
	sortDir: ScryfallSortDir;
	onSortChange: (order: ScryfallSortOrder, dir: ScryfallSortDir) => void;
}

type ViewMode = 'simple' | 'collection';

function SetCardsGridInner({
	completion,
	cards,
	isLoading,
	sortOrder,
	sortDir,
	onSortChange,
}: SetCardsGridProps) {
	const { addCard } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const [selectedCard, setSelectedCard] = useState<AnyCard | null>(null);
	const [view, setView] = useState<ViewMode>('simple');

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

			<CardList
				cards={cards}
				isLoading={isLoading && cards.length === 0}
				onCardClick={handleCardClick}
				renderOverlay={isCollection ? renderOverlay : undefined}
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

// Memoized: the tab strip above re-renders on scroll/drag, but the grid only
// needs to re-render when its own props change — otherwise cards flicker.
export const SetCardsGrid = memo(SetCardsGridInner);
