'use client';

import { useState, useEffect } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { Button } from '@/components/Button/Button';
import styles from './AddToCollectionButton.module.css';

export interface AddToCollectionButtonProps {
	card: ScryfallCard;
}

export function AddToCollectionButton({ card }: AddToCollectionButtonProps) {
	const { addCards, decrementCard, getQuantity } = useCollectionContext();
	const { openAddCard } = useAddCardModal();
	const [showFeedback, setShowFeedback] = useState(false);
	const quantity = getQuantity(card.id);

	useEffect(() => {
		if (!showFeedback) return;
		const timer = setTimeout(() => setShowFeedback(false), 1500);
		return () => clearTimeout(timer);
	}, [showFeedback]);

	function openAdd() {
		openAddCard({
			scryfallCard: card,
			onAdd: (selectedCard: ScryfallCard, entry: Partial<CardEntry>, count: number) => {
				addCards(selectedCard, count, entry);
				setShowFeedback(true);
			},
		});
	}

	if (quantity === 0) {
		return (
			<div className={styles.container}>
				<Button variant="primary" onClick={openAdd}>
					Add to Collection
				</Button>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.controls}>
				<span className={styles.label}>{showFeedback ? 'Added!' : 'In Collection'}</span>
				<div className={styles.quantityControls}>
					<button
						type="button"
						className={styles.quantityButton}
						onClick={() => decrementCard(card.id)}
						aria-label="Remove one"
					>
						-
					</button>
					<span className={styles.quantity}>{quantity}</span>
					<button
						type="button"
						className={styles.quantityButton}
						onClick={openAdd}
						aria-label="Add one"
					>
						+
					</button>
				</div>
			</div>
		</div>
	);
}
