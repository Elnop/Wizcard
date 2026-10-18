import styles from './BulkSelectOverlay.module.css';

/** Checked frame + checkbox drawn over a tile in selection mode. */
export function BulkSelectOverlay({ checked }: { checked: boolean }) {
	return (
		<div className={checked ? `${styles.overlay} ${styles.checked}` : styles.overlay}>
			<input type="checkbox" className={styles.box} checked={checked} readOnly tabIndex={-1} />
		</div>
	);
}
