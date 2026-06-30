'use client';

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
}: Props) {
	const hasSelection = selectedCount > 0;

	return (
		<div className={styles.bar}>
			<span className={styles.count}>{selectedCount} selected</span>

			<button type="button" className={styles.action} onClick={onToggleSelectAll}>
				{allSelected ? 'Deselect all' : 'Select all'}
			</button>

			<span className={styles.divider} aria-hidden="true" />

			<button type="button" className={styles.action} onClick={onBulkEdit} disabled={!hasSelection}>
				Edit
			</button>
			<button
				type="button"
				className={styles.action}
				onClick={onBulkAddToCollection}
				disabled={!hasSelection}
			>
				Add to collection
			</button>
			<button
				type="button"
				className={styles.action}
				onClick={onBulkAddToWishlist}
				disabled={!hasSelection}
			>
				<WishlistIcon size={13} /> Wishlist
			</button>
			<button
				type="button"
				className={`${styles.action} ${styles.danger}`}
				onClick={onBulkRemove}
				disabled={!hasSelection}
			>
				Remove
			</button>

			<span className={styles.divider} aria-hidden="true" />

			<button type="button" className={styles.clear} onClick={onClear} disabled={!hasSelection}>
				Clear
			</button>
		</div>
	);
}
