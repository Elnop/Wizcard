'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export type ContextMenuAction =
	| { type: 'action'; label: string; icon?: string; danger?: boolean; onClick: () => void }
	| { type: 'divider' };

type Props = {
	items: ContextMenuAction[];
	position: { x: number; y: number };
	onClose: () => void;
};

export function ContextMenu({ items, position, onClose }: Props) {
	const MENU_WIDTH = 180;
	const estimatedHeight = items.reduce((h, item) => h + (item.type === 'divider' ? 9 : 32), 8);
	const x = position.x + MENU_WIDTH > window.innerWidth ? position.x - MENU_WIDTH : position.x;
	const y =
		position.y + estimatedHeight > window.innerHeight ? position.y - estimatedHeight : position.y;

	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	useEffect(() => {
		const close = () => onCloseRef.current();
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('click', close);
		document.addEventListener('contextmenu', close, true);
		document.addEventListener('keydown', handleKey);
		document.addEventListener('scroll', close, true);
		return () => {
			document.removeEventListener('click', close);
			document.removeEventListener('contextmenu', close, true);
			document.removeEventListener('keydown', handleKey);
			document.removeEventListener('scroll', close, true);
		};
	}, []);

	return createPortal(
		<div
			className={styles.contextMenu}
			style={{ left: x, top: y }}
			onClick={(e) => e.stopPropagation()}
		>
			{items.map((item, i) => {
				if (item.type === 'divider') {
					return <div key={`divider-${i}`} className={styles.menuDivider} />;
				}
				return (
					<button
						key={item.label}
						type="button"
						className={`${styles.menuItem}${item.danger ? ` ${styles.menuItemDanger}` : ''}`}
						onClick={item.onClick}
					>
						{item.icon && <span className={styles.menuIcon}>{item.icon}</span>}
						{item.label}
					</button>
				);
			})}
		</div>,
		document.body
	);
}
