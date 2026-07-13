'use client';

import type { SaveStatus } from '../useSaveStatus';
import styles from './SettingsSection.module.css';

const STATUS_LABEL: Record<SaveStatus, string> = {
	idle: '',
	saving: 'Enregistrement…',
	saved: 'Enregistré',
	error: 'Échec de l’enregistrement',
};

export function SettingsSection({
	title,
	status = 'idle',
	children,
}: {
	title: string;
	status?: SaveStatus;
	children: React.ReactNode;
}) {
	return (
		<section className={styles.section}>
			<header className={styles.header}>
				<h2 className={styles.title}>{title}</h2>
				{status !== 'idle' && (
					<span className={`${styles.status} ${styles[status]}`}>{STATUS_LABEL[status]}</span>
				)}
			</header>
			<div className={styles.body}>{children}</div>
		</section>
	);
}
