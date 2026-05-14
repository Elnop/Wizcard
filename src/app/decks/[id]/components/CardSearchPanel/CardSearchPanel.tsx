'use client';

import { useState } from 'react';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { Spinner } from '@/components/Spinner/Spinner';
import { Button } from '@/components/Button/Button';
import {
	useScryfallCardSearch,
	type SearchFilters,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import styles from './CardSearchPanel.module.css';

type Props = {
	onCardClick: (card: ScryfallCard) => void;
	getQuantityInDeck: (scryfallId: string) => number;
	onClose: () => void;
};

export function CardSearchPanel({ onCardClick, getQuantityInDeck, onClose }: Props) {
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
		<aside className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>Add Cards</span>
				<button
					type="button"
					className={styles.closeBtn}
					onClick={onClose}
					aria-label="Close panel"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.search}>
				<SearchBar value={searchName} onChange={setSearchName} placeholder="Search for a card..." />
			</div>

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
						<button
							key={card.id}
							type="button"
							className={styles.resultRow}
							onClick={() => onCardClick(card)}
						>
							<div className={styles.resultImage}>
								<CardImage card={card} size="small" />
							</div>
							<div className={styles.resultInfo}>
								<span className={styles.resultName}>{card.name}</span>
								<span className={styles.resultMeta}>
									{card.set_name} &middot; {card.type_line}
								</span>
							</div>
							{qty > 0 && <span className={styles.qtyBadge}>x{qty}</span>}
						</button>
					);
				})}

				{hasMore && (
					<div className={styles.loadMore}>
						<Button
							variant="ghost"
							size="sm"
							onClick={(e) => {
								e.stopPropagation();
								loadMore();
							}}
						>
							Load more
						</Button>
					</div>
				)}
			</div>
		</aside>
	);
}
