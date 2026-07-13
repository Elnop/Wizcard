'use client';

import { useTranslations } from 'next-intl';
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

export function ConfirmModal({ message, confirmLabel, children, onConfirm, onClose }: Props) {
	const t = useTranslations('common');
	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<p className={styles.message}>{message}</p>
			{children}
			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button variant="danger" size="sm" onClick={onConfirm}>
					{confirmLabel ?? t('confirm')}
				</Button>
			</div>
		</Modal>
	);
}
