import { useTranslations } from 'next-intl';
import { isCustomCard } from '@/lib/mpc/types';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import styles from './CustomCardBadge.module.css';

export function CustomCardBadge({ card }: { card: AnyCard }) {
	const t = useTranslations('card');
	if (!isCustomCard(card)) return null;
	return (
		<span className={styles.badge} aria-label={t('customBadge')}>
			{t('custom')}
		</span>
	);
}
