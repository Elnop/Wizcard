'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';
import { useAnalytics } from '../../context/AnalyticsContext';
import styles from './AppErrorBoundary.module.css';

// Shared by every error.tsx. Captures the exception via the analytics port
// (never posthog directly) and renders a clean, i18n error UI with a retry button.
export function AppErrorBoundary({
	error,
	reset,
	scope,
}: {
	error: Error & { digest?: string };
	reset: () => void;
	scope?: string;
}) {
	const analytics = useAnalytics();
	const t = useTranslations('error');

	useEffect(() => {
		analytics.captureException(error, { scope, digest: error.digest });
	}, [error, analytics, scope]);

	return (
		<div className={styles.wrap} role="alert">
			<h2 className={styles.title}>{t('title')}</h2>
			<p className={styles.message}>{t('description')}</p>
			<Button variant="primary" onClick={reset}>
				{t('retry')}
			</Button>
		</div>
	);
}
