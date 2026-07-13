'use client';

import { useTranslations } from 'next-intl';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { AccountSection } from './sections/AccountSection';
import { DisplaySection } from './sections/DisplaySection';
import { LanguageSection } from './sections/LanguageSection';
import { PrivacySection } from './sections/PrivacySection';
import { ProfileSection } from './sections/ProfileSection';
import styles from './SettingsView.module.css';

export default function SettingsView() {
	const t = useTranslations('settings');
	const { profile, isLoading } = useProfileContext();

	if (isLoading || !profile) {
		return (
			<div className={styles.loading}>
				<Spinner />
			</div>
		);
	}

	return (
		<main className={styles.page}>
			<h1 className={styles.title}>{t('title')}</h1>
			<ProfileSection />
			<LanguageSection />
			<DisplaySection />
			<PrivacySection />
			<AccountSection />
		</main>
	);
}
