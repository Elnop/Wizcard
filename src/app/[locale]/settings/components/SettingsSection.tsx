'use client';

import { useTranslations } from 'next-intl';
import type { SaveStatus } from '../useSaveStatus';
import styles from './SettingsSection.module.css';

/** Shared themed field classes (input, textarea, checkbox, hint, …) for sections. */
export { styles as settingsStyles };

export function SettingsSection({
	title,
	status = 'idle',
	children,
}: {
	title: string;
	status?: SaveStatus;
	children: React.ReactNode;
}) {
	const t = useTranslations('settings.status');
	return (
		<section className={styles.section}>
			<header className={styles.header}>
				<h2 className={styles.title}>{title}</h2>
				{status !== 'idle' && (
					<span className={`${styles.status} ${styles[status]}`}>{t(status)}</span>
				)}
			</header>
			<div className={styles.body}>{children}</div>
		</section>
	);
}
