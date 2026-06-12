import { Suspense } from 'react';
import type { CustomCard } from '@/lib/mpc/types';
import { CustomCardPageHeader } from '../CustomCardPageHeader/CustomCardPageHeader';
import { CustomCardTabs } from '../CustomCardTabs/CustomCardTabs';
import styles from '../../page.module.css';

interface Props {
	card: CustomCard;
}

export function CustomCardPage({ card }: Props) {
	return (
		<div className={styles.page}>
			<CustomCardPageHeader card={card} />
			<Suspense>
				<CustomCardTabs card={card} />
			</Suspense>
		</div>
	);
}
