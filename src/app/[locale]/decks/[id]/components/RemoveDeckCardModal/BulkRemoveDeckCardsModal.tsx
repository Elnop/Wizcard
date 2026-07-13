'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './RemoveDeckCardModal.module.css';

type Props = {
	/** Number of distinct cards being removed (selected groups). */
	cardCount: number;
	/** Whether any selected copy is also owned in the collection. */
	hasOwned: boolean;
	/** Whether any selected copy is also on the wishlist. */
	hasWishlist: boolean;
	onConfirm: (opts: { alsoRemoveCollection: boolean; alsoRemoveWishlist: boolean }) => void;
	onClose: () => void;
};

/**
 * Bulk variant of RemoveDeckCardModal. Surfaces a checkbox for each membership
 * present across the selection (collection / wishlist) and applies the choice
 * to every removed copy.
 */
export function BulkRemoveDeckCardsModal({
	cardCount,
	hasOwned,
	hasWishlist,
	onConfirm,
	onClose,
}: Props) {
	const [alsoRemoveCollection, setAlsoRemoveCollection] = useState(false);
	const [alsoRemoveWishlist, setAlsoRemoveWishlist] = useState(true);

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>Remove from deck</h2>
			<p className={styles.summary}>
				Remove <strong>{cardCount}</strong> card{cardCount > 1 ? 's' : ''} from the deck.
			</p>

			{(hasOwned || hasWishlist) && (
				<div className={styles.options}>
					{hasOwned && (
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={alsoRemoveCollection}
								onChange={(e) => setAlsoRemoveCollection(e.target.checked)}
							/>
							Also remove from collection
						</label>
					)}
					{hasWishlist && (
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={alsoRemoveWishlist}
								onChange={(e) => setAlsoRemoveWishlist(e.target.checked)}
							/>
							Also remove from wishlist
						</label>
					)}
				</div>
			)}

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() => onConfirm({ alsoRemoveCollection, alsoRemoveWishlist })}
				>
					Remove
				</Button>
			</div>
		</Modal>
	);
}
