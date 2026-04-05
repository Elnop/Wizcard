'use client';

import { useEffect } from 'react';
import styles from './VaultModal.module.css';

export interface ModalProps {
	children: React.ReactNode;
	onClose?: () => void;
	className?: string;
	zIndex?: number;
}

export function VaultModal({ children, onClose, className, zIndex }: ModalProps) {
	useEffect(() => {
		document.body.style.overflow = 'hidden';
		document.documentElement.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
			document.documentElement.style.overflow = '';
		};
	}, []);

	return (
		<div
			className={styles.overlay}
			style={zIndex !== undefined ? { zIndex } : undefined}
			onClick={onClose}
		>
			<div
				className={`${styles.modal}${className ? ` ${className}` : ''}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div className={styles.cornerTL} />
				<div className={styles.cornerTR} />
				<div className={styles.cornerBL} />
				<div className={styles.cornerBR} />
				{children}
			</div>
		</div>
	);
}
