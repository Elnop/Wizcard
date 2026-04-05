'use client';

import { LibraryModal } from '../LibraryModal/LibraryModal';
import { LibraryButton } from '../LibraryButton/LibraryButton';
import styles from './LibraryConfirmModal.module.css';

export interface ConfirmModalProps {
	message: React.ReactNode;
	confirmLabel?: string;
	onConfirm: () => void;
	onClose: () => void;
}

export function LibraryConfirmModal({
	message,
	confirmLabel = 'Confirm',
	onConfirm,
	onClose,
}: ConfirmModalProps) {
	return (
		<LibraryModal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<p className={styles.message}>{message}</p>
			<div className={styles.actions}>
				<LibraryButton variant="secondary" size="sm" onClick={onClose}>
					Cancel
				</LibraryButton>
				<LibraryButton variant="danger" size="sm" onClick={onConfirm}>
					{confirmLabel}
				</LibraryButton>
			</div>
		</LibraryModal>
	);
}
