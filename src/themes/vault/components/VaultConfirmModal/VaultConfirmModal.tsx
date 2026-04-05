'use client';

import { VaultModal } from '../VaultModal/VaultModal';
import { VaultButton } from '../VaultButton/VaultButton';
import styles from './VaultConfirmModal.module.css';

export interface ConfirmModalProps {
	message: React.ReactNode;
	confirmLabel?: string;
	onConfirm: () => void;
	onClose: () => void;
}

export function VaultConfirmModal({
	message,
	confirmLabel = 'Confirm',
	onConfirm,
	onClose,
}: ConfirmModalProps) {
	return (
		<VaultModal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<p className={styles.message}>{message}</p>
			<div className={styles.actions}>
				<VaultButton variant="secondary" size="sm" onClick={onClose}>
					Cancel
				</VaultButton>
				<VaultButton variant="danger" size="sm" onClick={onConfirm}>
					{confirmLabel}
				</VaultButton>
			</div>
		</VaultModal>
	);
}
