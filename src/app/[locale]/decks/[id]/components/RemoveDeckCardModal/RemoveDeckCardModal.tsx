'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './RemoveDeckCardModal.module.css';

export type RemoveDeckCardMembership = 'collection' | 'wishlist';

type Props = {
	cardName: string;
	/** Where the removed copy also lives. Owned and wishlist are mutually exclusive. */
	membership: RemoveDeckCardMembership;
	/** alsoRemove true → delete the row entirely; false → keep it (detach from deck). */
	onConfirm: (opts: { alsoRemove: boolean }) => void;
	onClose: () => void;
};

export function RemoveDeckCardModal({ cardName, membership, onConfirm, onClose }: Props) {
	const t = useTranslations('decks');
	// Default: remove from wishlist too (yes), keep in collection (no).
	const [alsoRemove, setAlsoRemove] = useState(membership === 'wishlist');

	const label =
		membership === 'wishlist' ? t('alsoRemoveFromWishlist') : t('alsoRemoveFromCollection');
	const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>{t('removeFromDeck')}</h2>
			<p className={styles.summary}>
				{membership === 'wishlist'
					? t.rich('alsoInWishlist', { name: cardName, strong })
					: t.rich('alsoInCollection', { name: cardName, strong })}
			</p>

			<div className={styles.options}>
				<label className={styles.option}>
					<input
						type="checkbox"
						checked={alsoRemove}
						onChange={(e) => setAlsoRemove(e.target.checked)}
					/>
					{label}
				</label>
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button variant="primary" size="sm" onClick={() => onConfirm({ alsoRemove })}>
					{t('remove')}
				</Button>
			</div>
		</Modal>
	);
}
