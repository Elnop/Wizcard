'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './AddCardToCollectionModal.module.css';

export type AddCardToCollectionOptions = {
	rowIds: string[];
	asProxy: boolean;
	removeWishlist: boolean;
};

type Props = {
	cardName: string;
	/** rowIds of the unowned copies of this card in the current zone (length >= 1). */
	unownedRowIds: string[];
	/** Number of wishlist copies matching this card's prints. */
	wishlistMatchCount: number;
	onConfirm: (options: AddCardToCollectionOptions) => void;
	onClose: () => void;
};

export function AddCardToCollectionModal({
	cardName,
	unownedRowIds,
	wishlistMatchCount,
	onConfirm,
	onClose,
}: Props) {
	const hasMultiple = unownedRowIds.length > 1;
	const [allCopies, setAllCopies] = useState(true);
	const [asProxy, setAsProxy] = useState(false);
	const [removeWishlist, setRemoveWishlist] = useState(wishlistMatchCount > 0);

	const addCount = hasMultiple && allCopies ? unownedRowIds.length : 1;

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>Add to collection</h2>
			<p className={styles.summary}>
				<strong>{cardName}</strong> —{' '}
				<strong>
					{addCount} cop{addCount !== 1 ? 'ies' : 'y'}
				</strong>{' '}
				to add
			</p>

			{hasMultiple && (
				<div className={styles.section}>
					<p className={styles.sectionTitle}>Copies</p>
					<div className={styles.options}>
						<label className={styles.option}>
							<input type="radio" checked={allCopies} onChange={() => setAllCopies(true)} />
							All unowned copies ({unownedRowIds.length})
						</label>
						<label className={styles.option}>
							<input type="radio" checked={!allCopies} onChange={() => setAllCopies(false)} />A
							single copy
						</label>
					</div>
				</div>
			)}

			<div className={styles.section}>
				<p className={styles.sectionTitle}>Options</p>
				<div className={styles.options}>
					<label className={styles.option}>
						<input
							type="checkbox"
							checked={asProxy}
							onChange={(e) => setAsProxy(e.target.checked)}
						/>
						Mark as proxy
					</label>
					{wishlistMatchCount > 0 && (
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={removeWishlist}
								onChange={(e) => setRemoveWishlist(e.target.checked)}
							/>
							Remove from wishlist ({wishlistMatchCount} card
							{wishlistMatchCount !== 1 ? 's' : ''})
						</label>
					)}
				</div>
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() =>
						onConfirm({
							rowIds: hasMultiple && allCopies ? unownedRowIds : [unownedRowIds[0]],
							asProxy,
							removeWishlist,
						})
					}
					disabled={unownedRowIds.length === 0}
				>
					Add
				</Button>
			</div>
		</Modal>
	);
}
