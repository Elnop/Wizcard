import { useState, useCallback } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { DeckCardGroup } from '../../useDeckCardSections';
import type { DeckZone } from '@/types/decks';
import type { Card } from '@/types/cards';
import { useCollectionBadge } from './useCollectionBadge';
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
	deckId: string;
	oracleScryfallIds: string[];
	deckNameResolver: (deckId: string) => string | undefined;
	onDuplicate: (rc: Card) => void;
	onRemove: (rowId: string) => void;
	onChangeZone: (rowId: string, zone: DeckZone) => void;
	onBadgeClick?: () => void;
	onAddToWishlist?: (scryfallId: string) => void;
	wishlistScryfallIds?: Set<string>;
};

export function DeckCardOverlay({
	group,
	currentZone,
	zones,
	deckId,
	oracleScryfallIds,
	deckNameResolver,
	onDuplicate,
	onRemove,
	onChangeZone,
	onBadgeClick,
	onAddToWishlist,
	wishlistScryfallIds,
}: Props) {
	const otherZones = zones.filter((z) => z !== currentZone);
	const zoneCopies = group.byZone.get(currentZone) ?? [];
	const lastCopy = zoneCopies[zoneCopies.length - 1];
	const count = zoneCopies.length;

	const { badgeState, ownedCount, neededCount, tooltipCopies } = useCollectionBadge(
		group,
		currentZone,
		deckId,
		oracleScryfallIds,
		deckNameResolver,
		wishlistScryfallIds
	);

	const badgeClass =
		badgeState === 'owned'
			? styles.ownershipBadgeGreen
			: badgeState === 'partial'
				? styles.ownershipBadgeOrange
				: badgeState === 'locked'
					? styles.ownershipBadgeLocked
					: badgeState === 'wishlist'
						? styles.ownershipBadgeWishlist
						: styles.ownershipBadgeGrey;

	const badgeText =
		badgeState === 'owned'
			? '✓'
			: badgeState === 'partial'
				? `${ownedCount}/${neededCount}`
				: badgeState === 'locked'
					? `0/${neededCount}`
					: badgeState === 'wishlist'
						? '🛒'
						: '';

	const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
	const closeMenu = useCallback(() => setMenuPos(null), []);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setMenuPos({ x: e.clientX, y: e.clientY });
	}, []);

	const representativeScryfallId = (zoneCopies[0]?.id ?? (group.representative as Card).id) || '';

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
		...(onAddToWishlist
			? [
					{ type: 'divider' as const },
					{
						type: 'action' as const,
						label: 'Add to Wishlist',
						icon: '🛒',
						onClick: () => {
							onAddToWishlist(representativeScryfallId);
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
				className={`${styles.ownershipBadge} ${badgeClass}`}
				onClick={(e) => {
					e.stopPropagation();
					onBadgeClick?.();
				}}
				style={onBadgeClick ? { cursor: 'pointer' } : undefined}
			>
				{badgeText}
				<span className={styles.ownershipTooltip}>
					<span className={styles.ownershipTooltipHeader}>Ma collection</span>
					{badgeState === 'none' ? (
						<span className={styles.ownershipTooltipItem}>Pas dans ma collection</span>
					) : badgeState === 'wishlist' ? (
						<span className={styles.ownershipTooltipItem}>En wishlist</span>
					) : (
						tooltipCopies.map((copy) => (
							<span
								key={copy.key}
								className={`${styles.ownershipTooltipItem}${copy.lockedDeckName ? ` ${styles.ownershipTooltipItemLocked}` : ''}`}
							>
								{copy.line}
								{copy.lockedDeckName ? ` 🔒 ${copy.lockedDeckName}` : ''}
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
