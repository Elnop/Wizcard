import { isCustomCard } from '@/lib/mpc/types';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import styles from './CustomCardBadge.module.css';

export function CustomCardBadge({ card }: { card: AnyCard }) {
	if (!isCustomCard(card)) return null;
	return <div className={styles.badge} aria-label="Carte custom" />;
}
