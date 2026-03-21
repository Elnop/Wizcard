'use client';

import { useState, useEffect } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useCollectionContext } from '@/lib/supabase/contexts/CollectionContext';
import { Button } from '@/components/ui/Button';
import styles from './AddToCollectionButton.module.css';

export interface AddToCollectionButtonProps {
	card: ScryfallCard;
}

export function AddToCollectionButton({ card }: AddToCollectionButtonProps) {
	const { addCard, decrementCard, getQuantity } = useCollectionContext();
	const [showFeedback, setShowFeedback] = useState(false);
	const quantity = getQuantity(card.id);

	useEffect(() => {
		if (!showFeedback) return;
		const timer = setTimeout(() => setShowFeedback(false), 1500);
		return () => clearTimeout(timer);
	}, [showFeedback]);

	const handleAdd = () => {
		addCard(card);
		setShowFeedback(true);
	};

	if (quantity === 0) {
		return (
			<div className={styles.container}>
				<Button variant="primary" onClick={handleAdd}>
					Add to Collection
				</Button>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.controls}>
				<span className={styles.label}>{showFeedback ? 'Added!' : `In Collection`}</span>
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
						onClick={handleAdd}
						aria-label="Add one"
					>
						+
					</button>
				</div>
			</div>
		</div>
	);
}
