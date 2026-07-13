'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';
import { useRouter, usePathname } from '@/i18n/navigation';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function LanguageSection() {
	const t = useTranslations('settings.language');
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	const router = useRouter();
	const pathname = usePathname();
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
						updateProfile({ language: value });
						// L'URL préfixée est l'autorité de rendu : on navigue vers la
						// nouvelle locale (met aussi à jour le cookie NEXT_LOCALE).
						router.replace(pathname, { locale: value });
					}}
				/>
			</div>
			<p className={s.hint}>{t('hint')}</p>
		</SettingsSection>
	);
}
