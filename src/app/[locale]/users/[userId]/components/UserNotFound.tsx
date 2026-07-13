'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from './UserNotFound.module.css';

/** Shown when a `/users/<nickname>/...` URL names a nickname no user has. */
export function UserNotFound() {
	const t = useTranslations('profile');
	return (
		<div className={styles.container}>
			<h1 className={styles.title}>{t('userNotFound')}</h1>
			<p className={styles.text}>{t('userNotFoundText')}</p>
			<Link href="/" className={styles.link}>
				{t('backHome')}
			</Link>
		</div>
	);
}
