'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';
import { useConsent } from '../../context/AnalyticsContext';
import styles from './ConsentBanner.module.css';

// Shown only while consent is 'unknown'. Accepting flips PostHog to persistent
// storage; refusing keeps it anonymous-in-memory (not a full opt-out).
export function ConsentBanner() {
	const { consent, accept, refuse } = useConsent();
	const t = useTranslations('consent');

	if (consent !== 'unknown') return null;

	return (
		<div className={styles.banner} role="dialog" aria-live="polite">
			<p className={styles.message}>{t('message')}</p>
			<div className={styles.actions}>
				<Button variant="ghost" onClick={refuse}>
					{t('refuse')}
				</Button>
				<Button variant="primary" onClick={accept}>
					{t('accept')}
				</Button>
			</div>
		</div>
	);
}
