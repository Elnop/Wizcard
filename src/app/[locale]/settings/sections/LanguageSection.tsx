'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { useLanguageSwitch } from '@/lib/profile/hooks/useLanguageSwitch';
import type { Language } from '@/lib/profile/types';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function LanguageSection() {
	const t = useTranslations('settings.language');
	const { profile } = useProfileContext();
	const { switchLocale } = useLanguageSwitch();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	// Endonymes : le libellé d'une langue s'écrit dans sa propre langue, donc
	// identique fr/en dans le catalogue.
	const languages: { value: Language; label: string }[] = [
		{ value: 'fr', label: t('french') },
		{ value: 'en', label: t('english') },
	];

	return (
		<SettingsSection title={t('title')} status={status}>
			<div className={s.field}>
				<span className={s.label}>{t('fieldLabel')}</span>
				<Select
					value={profile.language}
					options={languages}
					ariaLabel={t('fieldLabel')}
					onChange={(value) => {
						markSaving();
						// Navigation + persistance profil centralisées dans le hook.
						switchLocale(value);
					}}
				/>
			</div>
			<p className={s.hint}>{t('hint')}</p>
		</SettingsSection>
	);
}
