'use client';

import { useEffect } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
	children: React.ReactNode;
	onClose?: () => void;
	className?: string;
	/** Extra class for the inner scrollable body wrapper (e.g. to set padding
	 *  there instead of on the frame, so corner ornaments stay flush). */
	bodyClassName?: string;
	zIndex?: number;
}

export function Modal({ children, onClose, className, bodyClassName, zIndex }: ModalProps) {
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
				className={[styles.modal, className].filter(Boolean).join(' ')}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Corners are absolutely positioned on .modal (which never scrolls),
				    so they stay pinned to the visible frame. The content lives in a
				    separate .body wrapper that carries any scrolling. */}
				<div className={styles.cornerTL} />
				<div className={styles.cornerTR} />
				<div className={styles.cornerBL} />
				<div className={styles.cornerBR} />
				<div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
			</div>
		</div>
	);
}
