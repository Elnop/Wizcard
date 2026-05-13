import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { DeckCardGroup } from '../../useDeckCardSections';
import type { DeckZone } from '@/types/decks';
import type { Card } from '@/types/cards';
import styles from './DeckCardOverlay.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
};

type Props = {
	group: DeckCardGroup;
	currentZone: DeckZone;
	zones: DeckZone[];
	onDuplicate: (rc: Card) => void;
	onRemove: (rowId: string) => void;
	onChangeZone: (rowId: string, zone: DeckZone) => void;
};

export function DeckCardOverlay({
	group,
	currentZone,
	zones,
	onDuplicate,
	onRemove,
	onChangeZone,
}: Props) {
	const otherZones = zones.filter((z) => z !== currentZone);
	const zoneCopies = group.byZone.get(currentZone) ?? [];
	const lastCopy = zoneCopies[zoneCopies.length - 1];
	const count = zoneCopies.length;

	const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
	const closeMenu = useCallback(() => setMenuPos(null), []);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const MENU_WIDTH = 180;
		const MENU_HEIGHT = 160;
		const x = e.clientX + MENU_WIDTH > window.innerWidth ? e.clientX - MENU_WIDTH : e.clientX;
		const y = e.clientY + MENU_HEIGHT > window.innerHeight ? e.clientY - MENU_HEIGHT : e.clientY;
		setMenuPos({ x, y });
	}, []);

	useEffect(() => {
		if (!menuPos) return;
		const handleClick = () => closeMenu();
		const handleContextMenu = () => closeMenu();
		const handleScroll = () => closeMenu();
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeMenu();
		};
		document.addEventListener('click', handleClick);
		document.addEventListener('contextmenu', handleContextMenu, true);
		document.addEventListener('keydown', handleKey);
		document.addEventListener('scroll', handleScroll, true);
		return () => {
			document.removeEventListener('click', handleClick);
			document.removeEventListener('contextmenu', handleContextMenu, true);
			document.removeEventListener('keydown', handleKey);
			document.removeEventListener('scroll', handleScroll, true);
		};
	}, [menuPos, closeMenu]);

	return (
		<div className={styles.overlay} onContextMenu={handleContextMenu}>
			{count > 1 && <span className={styles.countBadge}>x{count}</span>}

			{menuPos &&
				createPortal(
					<div
						className={styles.contextMenu}
						style={{ left: menuPos.x, top: menuPos.y }}
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className={styles.menuItem}
							onClick={() => {
								onDuplicate(zoneCopies[0] ?? (group.representative as Card));
								closeMenu();
							}}
						>
							<span className={styles.menuIcon}>+</span>
							Add copy
						</button>
						{lastCopy && (
							<button
								type="button"
								className={`${styles.menuItem} ${styles.menuItemDanger}`}
								onClick={() => {
									onRemove(lastCopy.entry.rowId);
									closeMenu();
								}}
							>
								<span className={styles.menuIcon}>−</span>
								Remove copy
							</button>
						)}
						{otherZones.length > 0 && <div className={styles.menuDivider} />}
						{otherZones.map((zone) => (
							<button
								key={zone}
								type="button"
								className={styles.menuItem}
								onClick={() => {
									if (lastCopy) onChangeZone(lastCopy.entry.rowId, zone);
									closeMenu();
								}}
							>
								<span className={styles.menuIcon}>→</span>
								Move to {ZONE_LABELS[zone]}
							</button>
						))}
					</div>,
					document.body
				)}
		</div>
	);
}
