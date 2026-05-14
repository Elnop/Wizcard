import { useState, useCallback } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
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
		setMenuPos({ x: e.clientX, y: e.clientY });
	}, []);

	const items: ContextMenuAction[] = [
		{
			type: 'action',
			label: 'Add copy',
			icon: '+',
			onClick: () => {
				onDuplicate(zoneCopies[0] ?? (group.representative as Card));
				closeMenu();
			},
		},
		...(lastCopy
			? [
					{
						type: 'action' as const,
						label: 'Remove copy',
						icon: '−',
						danger: true,
						onClick: () => {
							onRemove(lastCopy.entry.rowId);
							closeMenu();
						},
					},
				]
			: []),
		...(otherZones.length > 0 ? [{ type: 'divider' as const }] : []),
		...otherZones.map((zone) => ({
			type: 'action' as const,
			label: `Move to ${ZONE_LABELS[zone]}`,
			icon: '→',
			onClick: () => {
				if (lastCopy) onChangeZone(lastCopy.entry.rowId, zone);
				closeMenu();
			},
		})),
	];

	return (
		<div className={styles.overlay} onContextMenu={handleContextMenu}>
			{count > 1 && <span className={styles.countBadge}>x{count}</span>}
			{menuPos && <ContextMenu items={items} position={menuPos} onClose={closeMenu} />}
		</div>
	);
}
