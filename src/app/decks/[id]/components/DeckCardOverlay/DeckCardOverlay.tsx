import type { DeckCardGroup } from '../../hooks/useDeckCardSections';
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

	return (
		<div className={styles.overlay}>
			{group.count > 1 && <span className={styles.countBadge}>x{group.count}</span>}
			<div className={styles.actions}>
				<button
					type="button"
					className={styles.actionBtn}
					onClick={(e) => {
						e.stopPropagation();
						onDuplicate(group.representative);
					}}
					title="Add copy"
				>
					+
				</button>
				<button
					type="button"
					className={styles.actionBtn}
					onClick={(e) => {
						e.stopPropagation();
						onRemove(lastCopy.entry.rowId);
					}}
					title="Remove copy"
				>
					-
				</button>
				{otherZones.map((zone) => (
					<button
						key={zone}
						type="button"
						className={styles.moveBtn}
						onClick={(e) => {
							e.stopPropagation();
							onChangeZone(group.representative.entry.rowId, zone);
						}}
						title={`Move to ${ZONE_LABELS[zone]}`}
					>
						→ {ZONE_LABELS[zone]}
					</button>
				))}
			</div>
		</div>
	);
}
