'use client';

import { Modal } from './Modal';
import styles from './ConfirmModal.module.css';

interface Props {
	message: React.ReactNode;
	confirmLabel?: string;
	onConfirm: () => void;
	onClose: () => void;
}

export function ConfirmModal({ message, confirmLabel = 'Confirm', onConfirm, onClose }: Props) {
	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<p className={styles.message}>{message}</p>
			<div className={styles.actions}>
				<button type="button" className={styles.cancelBtn} onClick={onClose}>
					Cancel
				</button>
				<button type="button" className={styles.confirmBtn} onClick={onConfirm}>
					{confirmLabel}
				</button>
			</div>
		</Modal>
	);
}
