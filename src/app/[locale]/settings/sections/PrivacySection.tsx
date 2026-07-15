'use client';

import { useTranslations } from 'next-intl';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function PrivacySection() {
	const t = useTranslations('settings.privacy');
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title={t('title')} status={status} comingSoon>
			<label className={s.checkboxRow}>
				<input
					type="checkbox"
					className={s.checkbox}
					checked={profile.isPublic}
					onChange={(e) => {
						markSaving();
						updateProfile({ isPublic: e.target.checked });
					}}
				/>
				<span>{t('publicProfile')}</span>
			</label>
			<p className={s.hint}>{t('hint')}</p>
		</SettingsSection>
	);
}
