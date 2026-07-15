'use client';

import { useTranslations } from 'next-intl';
import type { SaveStatus } from '../useSaveStatus';
import styles from './SettingsSection.module.css';

/** Shared themed field classes (input, textarea, checkbox, hint, …) for sections. */
export { styles as settingsStyles };

export function SettingsSection({
	title,
	status = 'idle',
	comingSoon = false,
	children,
}: {
	title: string;
	status?: SaveStatus;
	/** Disable the section's controls and show a "coming soon" badge. */
	comingSoon?: boolean;
	children: React.ReactNode;
}) {
	const t = useTranslations('settings.status');
	return (
		<section className={`${styles.section} ${comingSoon ? styles.disabled : ''}`}>
			<header className={styles.header}>
				<h2 className={styles.title}>{title}</h2>
				{comingSoon ? (
					<span className={styles.comingSoon}>{t('comingSoon')}</span>
				) : (
					status !== 'idle' && (
						<span className={`${styles.status} ${styles[status]}`}>{t(status)}</span>
					)
				)}
			</header>
			<div className={styles.body} aria-disabled={comingSoon || undefined}>
				{children}
			</div>
		</section>
	);
}
