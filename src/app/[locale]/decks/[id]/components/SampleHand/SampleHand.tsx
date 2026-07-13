'use client';

import { useTranslations } from 'next-intl';
import type { Card } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { Button } from '@/components/Button/Button';
import { useSampleHand } from './useSampleHand';
import styles from './SampleHand.module.css';

type Props = {
	mainboard: Card[];
};

export function SampleHand({ mainboard }: Props) {
	const t = useTranslations('decks');
	const { openCardModal } = useCardModalContext();
	const { hand, hasHand, canDraw, mulligan, draw } = useSampleHand(mainboard);

	if (mainboard.length === 0) return null;

	return (
		<div className={styles.panel}>
			<h3 className={styles.title}>{t('sampleHand')}</h3>

			{!hasHand ? (
				<div className={styles.placeholder} aria-hidden />
			) : (
				<>
					<CardList
						cards={hand}
						viewModes={['fluid-grid']}
						pageSize={false}
						onCardClick={(c: AnyCard) => openCardModal([c as Card], { readOnly: true })}
					/>
					<div className={styles.actions}>
						<Button variant="secondary" onClick={mulligan}>
							Mulligan
						</Button>
						<Button variant="secondary" onClick={draw} disabled={!canDraw}>
							Piocher
						</Button>
						<span className={styles.counter}>
							{hand.length} cartes · bibliothèque : {mainboard.length - hand.length}
						</span>
					</div>
				</>
			)}
		</div>
	);
}
