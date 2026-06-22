import { useCallback } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { DeckZone, DeckCardGroup } from '@/types/decks';
import type { Card, CardEntry } from '@/types/cards';
import { useCollectionBadge } from './useCollectionBadge';
import { buildCollectionAddRequest } from '../../collectionAddRequest';
import type { CollectionAddRequest } from '../../collectionAddRequest';
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
import styles from './DeckCardOverlay.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

function buildContextMenuItems(
	zoneCopies: Card[],
	otherZones: DeckZone[],
	lastCopy: Card | undefined,
	representativeScryfallId: string,
	group: DeckCardGroup,
	onDuplicate: (card: Card) => void,
	onRemove: (rowId: string) => void,
	onChangeZone: (rowId: string, zone: DeckZone) => void,
	onAddToWishlist: ((deckCardRowId: string) => void) | undefined,
	wishlistTargetRowId: string | undefined,
	onAddToCollection: ((req: CollectionAddRequest) => void) | undefined,
	buildRequest: () => CollectionAddRequest,
	hasUnowned: boolean,
	closeMenu: () => void
): ContextMenuAction[] {
	return [
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
		...(onAddToWishlist || (onAddToCollection && hasUnowned) ? [{ type: 'divider' as const }] : []),
		...(onAddToCollection && hasUnowned
			? [
					{
						type: 'action' as const,
						label: 'Add to Collection',
						icon: '＋',
						onClick: () => {
							onAddToCollection(buildRequest());
							closeMenu();
						},
					},
				]
			: []),
		...(onAddToWishlist && wishlistTargetRowId
			? [
					{
						type: 'action' as const,
						label: 'Add to Wishlist',
						icon: '🛒',
						onClick: () => {
							onAddToWishlist(wishlistTargetRowId);
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
}

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
	onAddToCollectionClick?: (req: CollectionAddRequest) => void;
	onAddToWishlist?: (deckCardRowId: string) => void;
	wishlistEntries?: Array<{ scryfallId: string; entry: CardEntry }>;
	contextMenuPos?: { x: number; y: number } | null;
	onContextMenuClose?: () => void;
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
	onAddToCollectionClick,
	onAddToWishlist,
	wishlistEntries,
	contextMenuPos,
	onContextMenuClose,
}: Props) {
	const otherZones = currentZone === 'tokens' ? [] : zones.filter((z) => z !== currentZone);
	const zoneCopies = group.byZone.get(currentZone) ?? [];
	const lastCopy = zoneCopies[zoneCopies.length - 1];
	const count = zoneCopies.length;

	const { badgeState, ownedCount, neededCount, tooltipCopies, wishlistTooltipCopies } =
		useCollectionBadge(
			group,
			currentZone,
			deckId,
			oracleScryfallIds,
			deckNameResolver,
			wishlistEntries
		);

	const closeMenu = useCallback(() => onContextMenuClose?.(), [onContextMenuClose]);

	const representativeScryfallId = (zoneCopies[0]?.id ?? (group.representative as Card).id) || '';
	// Wishlisting toggles the flag on an actual deck-card row (the first copy in
	// this zone), so the wishlist entry IS this deck card, not a separate copy.
	const wishlistTargetRowId = zoneCopies[0]?.entry.rowId;

	const hasUnowned = zoneCopies.some((c) => !c.entry.ownerId);

	const buildAddRequest = (): CollectionAddRequest =>
		buildCollectionAddRequest(
			group.representative.name,
			zoneCopies,
			oracleScryfallIds,
			wishlistEntries ?? []
		);

	const items = buildContextMenuItems(
		zoneCopies,
		otherZones,
		lastCopy,
		representativeScryfallId,
		group,
		onDuplicate,
		onRemove,
		onChangeZone,
		onAddToWishlist,
		wishlistTargetRowId,
		onAddToCollectionClick,
		buildAddRequest,
		hasUnowned,
		closeMenu
	);

	// The grey badge ("none") opens the add-to-collection confirmation modal via
	// the parent; other badge states keep their existing behaviour (print picker).
	const handleBadgeClick =
		badgeState === 'none' && onAddToCollectionClick
			? () => onAddToCollectionClick(buildAddRequest())
			: onBadgeClick;

	return (
		<div className={styles.overlay}>
			<OwnershipBadge
				badgeState={badgeState}
				ownedCount={ownedCount}
				neededCount={neededCount}
				onClick={handleBadgeClick}
				className={styles.deckBadgeHover}
			>
				<span className={styles.ownershipTooltip}>
					{tooltipCopies.length > 0 && (
						<>
							<span className={styles.ownershipTooltipHeader}>Ma collection</span>
							{tooltipCopies.map((copy) => (
								<span
									key={copy.key}
									className={[
										styles.ownershipTooltipItem,
										copy.lockedDeckName ? styles.ownershipTooltipItemLocked : '',
									]
										.filter(Boolean)
										.join(' ')}
								>
									{copy.line}
									{copy.lockedDeckName && (
										<span className={styles.ownershipTooltipLockIcon} title={copy.lockedDeckName}>
											<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
												<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
											</svg>
											{copy.lockedDeckName}
										</span>
									)}
								</span>
							))}
						</>
					)}
					{wishlistTooltipCopies.length > 0 && (
						<>
							<span
								className={`${styles.ownershipTooltipHeader} ${tooltipCopies.length > 0 ? styles.ownershipTooltipHeaderWishlist : ''}`}
							>
								Ma wishlist
							</span>
							{wishlistTooltipCopies.map((copy) => (
								<span key={copy.key} className={styles.ownershipTooltipItem}>
									{copy.line}
								</span>
							))}
						</>
					)}
					{tooltipCopies.length === 0 && wishlistTooltipCopies.length === 0 && (
						<span className={styles.ownershipTooltipItem}>Pas dans ma collection</span>
					)}
				</span>
			</OwnershipBadge>
			{count > 1 && <span className={styles.countBadge}>x{count}</span>}
			{contextMenuPos && (
				<ContextMenu items={items} position={contextMenuPos} onClose={closeMenu} />
			)}
		</div>
	);
}
