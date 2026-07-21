import type { DeckZone } from '@/types/decks';
import { ZONE_ABBREV, orderZones } from './zone-badge';
import styles from './DeckZoneBadges.module.css';

const ZONE_CLASS: Record<DeckZone, string> = {
	mainboard: styles.mainboard,
	sideboard: styles.sideboard,
	maybeboard: styles.maybeboard,
	commander: styles.commander,
	tokens: styles.tokens,
};

type Props = {
	zones: Map<DeckZone, number> | undefined;
};

/**
 * Corner badges showing, per zone, how many copies of this card are already in
 * the deck. Renders nothing when the card is not in the deck. The container is
 * pointer-events:none so it never blocks the overlay's click / context menu.
 */
export function DeckZoneBadges({ zones }: Props) {
	if (!zones) return null;
	const entries = orderZones(zones);
	if (entries.length === 0) return null;

	return (
		<div className={styles.badges}>
			{entries.map(([zone, count]) => (
				<span key={zone} className={`${styles.badge} ${ZONE_CLASS[zone]}`}>
					{ZONE_ABBREV[zone]} <span className={styles.count}>{count}</span>
				</span>
			))}
		</div>
	);
}
