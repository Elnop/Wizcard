import { useState, useCallback, useEffect } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { DeckCardGroup } from '../../useDeckCardSections';
import type { DeckZone } from '@/types/decks';
import type { Card } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { getCardsFromCache } from '@/lib/scryfall/utils/card-cache';
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
	const N = zoneCopies.length;
	const K = zoneCopies.filter((c) => !!c.entry.ownerId).length;

	const repScryfallId = group.representative.id;
	const repOracleId = (group.representative as { oracle_id?: string }).oracle_id;

	// Synchronous count of free copies with the exact same print
	const freeExact = collectionEntries.filter(
		(e) => e.scryfallId === repScryfallId && !e.entry.deckId
	).length;

	// Oracle-level count enriched via Scryfall cache (async, best-effort)
	const [freeOracle, setFreeOracle] = useState<number | null>(null);

	useEffect(() => {
		if (K > 0 || !repOracleId) return;
		const freeEntries = collectionEntries.filter((e) => !e.entry.deckId);
		const freeIds = [...new Set(freeEntries.map((e) => e.scryfallId))];
		if (freeIds.length === 0) return;
		void getCardsFromCache(freeIds).then((cached) => {
			const total = freeEntries.filter(
				(e) => cached.get(e.scryfallId)?.oracle_id === repOracleId
			).length;
			setFreeOracle(total);
		});
	}, [collectionEntries, repOracleId, K]);

	const freeCount = freeOracle ?? freeExact;

	const freeCopiesForTooltip = collectionEntries.filter(
		(e) => !e.entry.deckId && e.scryfallId === repScryfallId
	);

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
			{K > 0 ? (
				<span
					className={`${styles.ownershipBadge} ${K === N ? styles.ownershipBadgeGreen : styles.ownershipBadgeOrange}`}
				>
					{K}/{N}
				</span>
			) : freeCount > 0 ? (
				<span className={`${styles.ownershipBadge} ${styles.ownershipBadgeOrange}`}>
					{freeCount}
					{freeCopiesForTooltip.length > 0 && (
						<span className={styles.ownershipTooltip}>
							{freeCopiesForTooltip.map((e) => (
								<span key={e.entry.rowId} className={styles.ownershipTooltipItem}>
									{e.entry.condition ?? 'NM'}
									{e.entry.isFoil ? ' ✦' : ''}
									{e.entry.language && e.entry.language !== 'English'
										? ` · ${e.entry.language}`
										: ''}
								</span>
							))}
						</span>
					)}
				</span>
			) : null}
			{count > 1 && <span className={styles.countBadge}>x{count}</span>}
			{menuPos && <ContextMenu items={items} position={menuPos} onClose={closeMenu} />}
		</div>
	);
}
