'use client';

import { ForgeModal } from '../ForgeModal/ForgeModal';
import { ForgeButton } from '../ForgeButton/ForgeButton';
import styles from './ForgeConfirmModal.module.css';

export interface ConfirmModalProps {
	message: React.ReactNode;
	confirmLabel?: string;
	onConfirm: () => void;
	onClose: () => void;
}

export function ForgeConfirmModal({
	message,
	confirmLabel = 'Confirm',
	onConfirm,
	onClose,
}: ConfirmModalProps) {
	return (
		<ForgeModal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<p className={styles.message}>{message}</p>
			<div className={styles.actions}>
				<ForgeButton variant="secondary" size="sm" onClick={onClose}>
					Cancel
				</ForgeButton>
				<ForgeButton variant="danger" size="sm" onClick={onConfirm}>
					{confirmLabel}
				</ForgeButton>
			</div>
		</ForgeModal>
	);
}
