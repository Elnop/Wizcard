import { useState, useEffect, useCallback } from 'react';
import type { DeckCardGroup } from '../../useDeckCardSections';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '../../useDeckDetail';
import styles from './DeckCardOverlay.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
};

type Props = {
	group: DeckCardGroup;
	zones: DeckZone[];
	onDuplicate: (rc: ResolvedDeckCard) => void;
	onRemove: (rowId: string) => void;
	onChangeZone: (rowId: string, zone: DeckZone) => void;
};

export function DeckCardOverlay({ group, zones, onDuplicate, onRemove, onChangeZone }: Props) {
	const otherZones = zones.filter((z) => z !== group.zone);
	const lastCopy = group.allCopies[group.allCopies.length - 1];
	const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
	const closeMenu = useCallback(() => setMenuPos(null), []);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		// Approximate menu dimensions to avoid viewport overflow
		const MENU_WIDTH = 180;
		const MENU_HEIGHT = 160;
		const x = e.clientX + MENU_WIDTH > window.innerWidth ? e.clientX - MENU_WIDTH : e.clientX;
		const y = e.clientY + MENU_HEIGHT > window.innerHeight ? e.clientY - MENU_HEIGHT : e.clientY;
		setMenuPos({ x, y });
	}, []);

	useEffect(() => {
		if (!menuPos) return;
		const handleClick = () => closeMenu();
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeMenu();
		};
		document.addEventListener('click', handleClick);
		document.addEventListener('keydown', handleKey);
		return () => {
			document.removeEventListener('click', handleClick);
			document.removeEventListener('keydown', handleKey);
		};
	}, [menuPos, closeMenu]);

	return (
		<div className={styles.overlay} onContextMenu={handleContextMenu}>
			{group.count > 1 && <span className={styles.countBadge}>x{group.count}</span>}

			{menuPos && (
				<div
					className={styles.contextMenu}
					style={{ left: menuPos.x, top: menuPos.y }}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className={styles.menuItem}
						onClick={() => {
							onDuplicate(group.representative);
							closeMenu();
						}}
					>
						<span className={styles.menuIcon}>+</span>
						Add copy
					</button>
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
					{otherZones.length > 0 && <div className={styles.menuDivider} />}
					{otherZones.map((zone) => (
						<button
							key={zone}
							type="button"
							className={styles.menuItem}
							onClick={() => {
								onChangeZone(group.representative.entry.rowId, zone);
								closeMenu();
							}}
						>
							<span className={styles.menuIcon}>→</span>
							Move to {ZONE_LABELS[zone]}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
