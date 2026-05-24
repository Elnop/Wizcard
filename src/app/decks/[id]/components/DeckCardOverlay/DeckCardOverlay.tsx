import { useState, useCallback } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { DeckCardGroup } from '../../useDeckCardSections';
import type { DeckZone } from '@/types/decks';
import type { Card } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
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

	// Ownership badge
	const { entries: collectionEntries } = useCollectionContext();
	const K = zoneCopies.filter((c) => !!c.entry.ownerId).length;
	const repScryfallId = group.representative.id;
	const repSet = group.representative.set.toUpperCase();
	const repCollectorNumber = group.representative.collector_number;

	const freeCopies = collectionEntries.filter(
		(e) => e.scryfallId === repScryfallId && !e.entry.deckId
	);
	const freeExact = freeCopies.length;

	type BadgeState = 'none' | 'partial' | 'owned';
	const badgeState: BadgeState =
		K === count && count > 0 ? 'owned' : K > 0 || freeExact > 0 ? 'partial' : 'none';

	const formatCopyLine = (entry: { condition?: string; isFoil?: boolean; language?: string }) => {
		const parts: string[] = [`[${repSet} #${repCollectorNumber}]`];
		parts.push(entry.condition ?? 'NM');
		if (entry.isFoil) parts.push('✦');
		if (entry.language && entry.language !== 'English') parts.push(entry.language);
		return parts.join(' · ');
	};

	const tooltipCopies: { rowId: string; line: string }[] =
		badgeState === 'owned'
			? zoneCopies
					.filter((c) => !!c.entry.ownerId)
					.map((c) => ({ rowId: c.entry.rowId, line: formatCopyLine(c.entry) }))
			: badgeState === 'partial'
				? [
						...zoneCopies
							.filter((c) => !!c.entry.ownerId)
							.map((c) => ({ rowId: c.entry.rowId, line: formatCopyLine(c.entry) })),
						...freeCopies.map((e) => ({ rowId: e.entry.rowId, line: formatCopyLine(e.entry) })),
					]
				: [];

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
			<span
				className={`${styles.ownershipBadge} ${
					badgeState === 'owned'
						? styles.ownershipBadgeGreen
						: badgeState === 'partial'
							? styles.ownershipBadgeOrange
							: styles.ownershipBadgeGrey
				}`}
			>
				{badgeState === 'owned' ? '✓' : badgeState === 'partial' ? `${K}/${count}` : ''}
				<span className={styles.ownershipTooltip}>
					<span className={styles.ownershipTooltipHeader}>Ma collection</span>
					{badgeState === 'none' ? (
						<span className={styles.ownershipTooltipItem}>Pas dans ma collection</span>
					) : (
						tooltipCopies.map((copy) => (
							<span key={copy.rowId} className={styles.ownershipTooltipItem}>
								{copy.line}
							</span>
						))
					)}
				</span>
			</span>
			{count > 1 && <span className={styles.countBadge}>x{count}</span>}
			{menuPos && <ContextMenu items={items} position={menuPos} onClose={closeMenu} />}
		</div>
	);
}
