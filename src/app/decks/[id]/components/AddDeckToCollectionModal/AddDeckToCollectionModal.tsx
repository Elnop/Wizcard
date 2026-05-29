'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { AddDeckToCollectionOptions } from '../../useAddDeckToCollection';
import styles from './AddDeckToCollectionModal.module.css';

type Props = {
	ownedCount: number;
	unownedCount: number;
	wishlistMatchCount: number;
	onConfirm: (options: AddDeckToCollectionOptions) => void;
	onClose: () => void;
};

export function AddDeckToCollectionModal({
	ownedCount,
	unownedCount,
	wishlistMatchCount,
	onConfirm,
	onClose,
}: Props) {
	const [onlyMissing, setOnlyMissing] = useState(ownedCount > 0);
	const [asProxy, setAsProxy] = useState(false);
	const [removeWishlist, setRemoveWishlist] = useState(wishlistMatchCount > 0);

	const totalCount = ownedCount + unownedCount;
	const addCount = onlyMissing ? unownedCount : totalCount;

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>Ajouter le deck à la collection</h2>
			<p className={styles.summary}>
				<strong>
					{addCount} carte{addCount !== 1 ? 's' : ''}
				</strong>{' '}
				à ajouter
			</p>
			<div className={styles.options}>
				{ownedCount > 0 && (
					<label className={styles.option}>
						<input
							type="checkbox"
							checked={onlyMissing}
							onChange={(e) => setOnlyMissing(e.target.checked)}
						/>
						Seulement les non possédées ({unownedCount} carte{unownedCount !== 1 ? 's' : ''})
					</label>
				)}
				<label className={styles.option}>
					<input type="checkbox" checked={asProxy} onChange={(e) => setAsProxy(e.target.checked)} />
					Marquer comme proxy
				</label>
				{wishlistMatchCount > 0 && (
					<label className={styles.option}>
						<input
							type="checkbox"
							checked={removeWishlist}
							onChange={(e) => setRemoveWishlist(e.target.checked)}
						/>
						Supprimer de la wishlist ({wishlistMatchCount} carte
						{wishlistMatchCount !== 1 ? 's' : ''})
					</label>
				)}
			</div>
			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					Annuler
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() => onConfirm({ onlyMissing, asProxy, removeWishlist })}
					disabled={addCount === 0}
				>
					Ajouter
				</Button>
			</div>
		</Modal>
	);
}
