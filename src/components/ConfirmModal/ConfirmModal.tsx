'use client';

import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import styles from './ConfirmModal.module.css';

interface Props {
	message: React.ReactNode;
	confirmLabel?: string;
	children?: React.ReactNode;
	onConfirm: () => void;
	onClose: () => void;
}

export function ConfirmModal({
	message,
	confirmLabel = 'Confirm',
	children,
	onConfirm,
	onClose,
}: Props) {
	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<p className={styles.message}>{message}</p>
			{children}
			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					Cancel
				</Button>
				<Button variant="danger" size="sm" onClick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</Modal>
	);
}
