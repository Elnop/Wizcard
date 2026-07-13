'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './AddCardToCollectionModal.module.css';

export type AddCardToCollectionOptions = {
	rowIds: string[];
	asProxy: boolean;
};

type Props = {
	cardName: string;
	/** rowIds of the unowned copies of this card in the current zone (length >= 1). */
	unownedRowIds: string[];
	onConfirm: (options: AddCardToCollectionOptions) => void;
	onClose: () => void;
};

export function AddCardToCollectionModal({ cardName, unownedRowIds, onConfirm, onClose }: Props) {
	const t = useTranslations('decks');
	const hasMultiple = unownedRowIds.length > 1;
	const [allCopies, setAllCopies] = useState(true);
	const [asProxy, setAsProxy] = useState(false);

	const addCount = hasMultiple && allCopies ? unownedRowIds.length : 1;

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>{t('addToCollection2')}</h2>
			<p className={styles.summary}>
				{t.rich('copiesToAdd', {
					name: cardName,
					count: addCount,
					strong: (chunks) => <strong>{chunks}</strong>,
				})}
			</p>

			{hasMultiple && (
				<div className={styles.section}>
					<p className={styles.sectionTitle}>{t('copies2')}</p>
					<div className={styles.options}>
						<label className={styles.option}>
							<input type="radio" checked={allCopies} onChange={() => setAllCopies(true)} />
							{t('allUnownedCopies', { count: unownedRowIds.length })}
						</label>
						<label className={styles.option}>
							<input type="radio" checked={!allCopies} onChange={() => setAllCopies(false)} />
							{t('aSingleCopy')}
						</label>
					</div>
				</div>
			)}

			<div className={styles.section}>
				<p className={styles.sectionTitle}>{t('options')}</p>
				<div className={styles.options}>
					<label className={styles.option}>
						<input
							type="checkbox"
							checked={asProxy}
							onChange={(e) => setAsProxy(e.target.checked)}
						/>
						{t('markAsProxy')}
					</label>
				</div>
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() =>
						onConfirm({
							rowIds: hasMultiple && allCopies ? unownedRowIds : [unownedRowIds[0]],
							asProxy,
						})
					}
					disabled={unownedRowIds.length === 0}
				>
					{t('add')}
				</Button>
			</div>
		</Modal>
	);
}
