import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import styles from './CopyCardOverlay.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Main',
	sideboard: 'Side',
	maybeboard: 'Maybe',
	commander: 'Cmd',
};

type Props = {
	card: Card;
	isSelected: boolean;
	onEdit: () => void;
	onRemove: () => void;
	onDuplicate?: () => void;
	zone?: DeckZone;
	availableZones?: DeckZone[];
	onChangeZone?: (zone: DeckZone) => void;
	contextMenuPos?: { x: number; y: number } | null;
	onContextMenuClose?: () => void;
};

export function CopyCardOverlay({
	card,
	isSelected,
	onEdit,
	onRemove,
	onDuplicate,
	zone,
	availableZones,
	onChangeZone,
	contextMenuPos,
	onContextMenuClose,
}: Props) {
	const closeMenu = useCallback(() => onContextMenuClose?.(), [onContextMenuClose]);

	useEffect(() => {
		if (!contextMenuPos) return;
		const onClick = () => closeMenu();
		const onContextMenuOutside = () => closeMenu();
		const onScroll = () => closeMenu();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeMenu();
		};
		document.addEventListener('click', onClick);
		document.addEventListener('contextmenu', onContextMenuOutside, true);
		document.addEventListener('keydown', onKey);
		document.addEventListener('scroll', onScroll, true);
		return () => {
			document.removeEventListener('click', onClick);
			document.removeEventListener('contextmenu', onContextMenuOutside, true);
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('scroll', onScroll, true);
		};
	}, [contextMenuPos, closeMenu]);

	const otherZones = availableZones?.filter((z) => z !== zone) ?? [];
	const hasDivider = !!onDuplicate || otherZones.length > 0;

	return (
		<div className={`${styles.overlay} ${isSelected ? styles.selected : ''}`}>
			{/* Metadata badges always visible */}
			<div className={styles.badges}>
				{card.entry.condition && <span className={styles.badge}>{card.entry.condition}</span>}
				{card.entry.isFoil && <span className={styles.badgeFoil}>✦</span>}
				{card.entry.proxy && <span className={styles.badgeProxy}>Proxy</span>}
				{card.entry.language && card.entry.language !== 'English' && (
					<span className={styles.badge}>{card.entry.language}</span>
				)}
			</div>

			{/* Context menu rendered in a portal to escape the modal's backdrop-filter stacking context */}
			{contextMenuPos &&
				createPortal(
					<div
						className={styles.contextMenu}
						style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className={styles.menuItem}
							onClick={() => {
								onEdit();
								closeMenu();
							}}
						>
							<span className={styles.menuIcon}>✎</span>
							Edit
						</button>

						{hasDivider && <div className={styles.menuDivider} />}

						{onDuplicate && (
							<button
								type="button"
								className={styles.menuItem}
								onClick={() => {
									onDuplicate();
									closeMenu();
								}}
							>
								<span className={styles.menuIcon}>⧉</span>
								Duplicate
							</button>
						)}

						{otherZones.map((z) => (
							<button
								key={z}
								type="button"
								className={styles.menuItem}
								onClick={() => {
									onChangeZone?.(z);
									closeMenu();
								}}
							>
								<span className={styles.menuIcon}>→</span>
								{ZONE_LABELS[z]}
							</button>
						))}

						<div className={styles.menuDivider} />

						<button
							type="button"
							className={`${styles.menuItem} ${styles.menuItemDanger}`}
							onClick={() => {
								onRemove();
								closeMenu();
							}}
						>
							<span className={styles.menuIcon}>×</span>
							Remove
						</button>
					</div>,
					document.body
				)}
		</div>
	);
}
