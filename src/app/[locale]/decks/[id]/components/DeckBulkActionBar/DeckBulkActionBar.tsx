'use client';

import { useTranslations } from 'next-intl';
import { WishlistIcon } from '@/lib/wishlist/components/WishlistIcon';
import styles from './DeckBulkActionBar.module.css';

type Props = {
	selectedCount: number;
	allSelected: boolean;
	onToggleSelectAll: () => void;
	onBulkEdit: () => void;
	onBulkAddToCollection: () => void;
	onBulkAddToWishlist: () => void;
	onBulkRemove: () => void;
	onClear: () => void;
	/** Leave selection mode entirely (clears the selection too). */
	onExit: () => void;
};

/**
 * Floating action bar shown while the deck is in bulk-selection mode. "Select
 * all" is always available; the per-selection actions are disabled until at
 * least one card is selected.
 */
export function DeckBulkActionBar({
	selectedCount,
	allSelected,
	onToggleSelectAll,
	onBulkEdit,
	onBulkAddToCollection,
	onBulkAddToWishlist,
	onBulkRemove,
	onClear,
	onExit,
}: Props) {
	const t = useTranslations('decks');
	const hasSelection = selectedCount > 0;

	return (
		<div className={styles.bar}>
			<button
				type="button"
				className={styles.exit}
				onClick={onExit}
				aria-label={t('exitSelectionMode')}
				title={t('exitSelectionMode')}
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			<span className={styles.count}>{t('selectedCount', { count: selectedCount })}</span>

			<button type="button" className={styles.action} onClick={onToggleSelectAll}>
				{allSelected ? t('deselectAll') : t('selectAll')}
			</button>

			<span className={styles.divider} aria-hidden="true" />

			<button type="button" className={styles.action} onClick={onBulkEdit} disabled={!hasSelection}>
				{t('edit')}
			</button>
			<button
				type="button"
				className={styles.action}
				onClick={onBulkAddToCollection}
				disabled={!hasSelection}
			>
				{t('addToCollection')}
			</button>
			<button
				type="button"
				className={styles.action}
				onClick={onBulkAddToWishlist}
				disabled={!hasSelection}
			>
				<WishlistIcon size={13} /> {t('wishlist')}
			</button>
			<button
				type="button"
				className={`${styles.action} ${styles.danger}`}
				onClick={onBulkRemove}
				disabled={!hasSelection}
			>
				{t('remove')}
			</button>

			<span className={styles.divider} aria-hidden="true" />

			<button type="button" className={styles.clear} onClick={onClear} disabled={!hasSelection}>
				{t('clear')}
			</button>
		</div>
	);
}
