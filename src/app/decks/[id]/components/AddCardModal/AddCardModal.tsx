'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { Spinner } from '@/components/Spinner/Spinner';
import { Button } from '@/components/Button/Button';
import {
	useScryfallCardSearch,
	type SearchFilters,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import styles from './AddCardModal.module.css';

type Props = {
	onAdd: (card: ScryfallCard, zone: DeckZone) => void;
	onClose: () => void;
	activeZone: DeckZone;
	getQuantityInDeck: (scryfallId: string) => number;
};

export function AddCardModal({ onAdd, onClose, activeZone, getQuantityInDeck }: Props) {
	const [searchName, setSearchName] = useState('');

	const filters: SearchFilters = {
		name: searchName,
		colors: [],
		type: '',
		set: '',
		rarities: [],
		oracleText: '',
		cmc: '',
	};

	const { cards, isLoading, hasMore, loadMore } = useScryfallCardSearch(filters);

	return (
		<Modal onClose={onClose} className={styles.dialog}>
			<div className={styles.container}>
				<h2 className={styles.title}>Add Cards</h2>
				<SearchBar value={searchName} onChange={setSearchName} placeholder="Search for a card..." />

				<div className={styles.results}>
					{isLoading && cards.length === 0 && (
						<div className={styles.loading}>
							<Spinner />
						</div>
					)}

					{!isLoading && cards.length === 0 && searchName.trim() && (
						<p className={styles.noResults}>No cards found</p>
					)}

					{cards.map((card) => {
						const qty = getQuantityInDeck(card.id);
						return (
							<div key={card.id} className={styles.resultRow}>
								<div className={styles.resultImage}>
									<CardImage card={card} size="small" />
								</div>
								<div className={styles.resultInfo}>
									<span className={styles.resultName}>{card.name}</span>
									<span className={styles.resultMeta}>
										{card.set_name} &middot; {card.type_line}
									</span>
								</div>
								<div className={styles.resultActions}>
									{qty > 0 && <span className={styles.qtyBadge}>x{qty}</span>}
									<Button size="sm" onClick={() => onAdd(card, activeZone)}>
										+
									</Button>
								</div>
							</div>
						);
					})}

					{hasMore && (
						<div className={styles.loadMore}>
							<Button variant="ghost" size="sm" onClick={loadMore}>
								Load more
							</Button>
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
}
