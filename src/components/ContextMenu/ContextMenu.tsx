import { useEffect, useCallback } from 'react';
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

	const handleClose = useCallback(() => onClose(), [onClose]);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose();
		};
		document.addEventListener('click', handleClose);
		document.addEventListener('contextmenu', handleClose, true);
		document.addEventListener('keydown', handleKey);
		document.addEventListener('scroll', handleClose, true);
		return () => {
			document.removeEventListener('click', handleClose);
			document.removeEventListener('contextmenu', handleClose, true);
			document.removeEventListener('keydown', handleKey);
			document.removeEventListener('scroll', handleClose, true);
		};
	}, [handleClose]);

	return createPortal(
		<div
			className={styles.contextMenu}
			style={{ left: x, top: y }}
			onClick={(e) => e.stopPropagation()}
		>
			{items.map((item, i) => {
				if (item.type === 'divider') {
					return <div key={i} className={styles.menuDivider} />;
				}
				return (
					<button
						key={i}
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
