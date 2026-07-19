'use client';

import { useTranslations } from 'next-intl';
import type { Card } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useAnalytics } from '@/lib/analytics/context/AnalyticsContext';
import { Button } from '@/components/Button/Button';
import { useSampleHand } from './useSampleHand';
import styles from './SampleHand.module.css';

type Props = {
	deckId: string;
	mainboard: Card[];
};

export function SampleHand({ deckId, mainboard }: Props) {
	const t = useTranslations('decks');
	const { openCardModal } = useCardModalContext();
	const analytics = useAnalytics();
	const { hand, hasHand, canDraw, mulligan, draw } = useSampleHand(mainboard);

	// Track deliberate re-draws (mulligan). The initial auto-deal on mount is not
	// a user action, so it is not tracked.
	const handleMulligan = () => {
		mulligan();
		analytics.track({ name: 'sample_hand_drawn', props: { deckId } });
	};

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
						<Button variant="secondary" onClick={handleMulligan}>
							{t('mulligan')}
						</Button>
						<Button variant="secondary" onClick={draw} disabled={!canDraw}>
							{t('draw')}
						</Button>
						<span className={styles.counter}>
							{t('handLibraryCounter', {
								hand: hand.length,
								library: mainboard.length - hand.length,
							})}
						</span>
					</div>
				</>
			)}
		</div>
	);
}
