'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { PriceCurrency, ThemePreference } from '@/lib/profile/types';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function DisplaySection() {
	const t = useTranslations('settings.display');
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	const themes: { value: ThemePreference; label: string }[] = [
		{ value: 'system', label: t('themeSystem') },
		{ value: 'light', label: t('themeLight') },
		{ value: 'dark', label: t('themeDark') },
	];
	const currencies: { value: PriceCurrency; label: string }[] = [
		{ value: 'eur', label: t('currencyEur') },
		{ value: 'usd', label: t('currencyUsd') },
	];

	return (
		<SettingsSection title={t('title')} status={status} comingSoon>
			<div className={s.field}>
				<span className={s.label}>{t('theme')}</span>
				<Select
					value={profile.themePreference}
					options={themes}
					ariaLabel={t('theme')}
					onChange={(value) => {
						markSaving();
						updateProfile({ themePreference: value });
					}}
				/>
			</div>

			<label className={s.checkboxRow}>
				<input
					type="checkbox"
					className={s.checkbox}
					checked={profile.showPrices}
					onChange={(e) => {
						markSaving();
						updateProfile({ showPrices: e.target.checked });
					}}
				/>
				<span>{t('showPrices')}</span>
			</label>

			<div className={s.field}>
				<span className={s.label}>{t('currency')}</span>
				<Select
					value={profile.priceCurrency}
					options={currencies}
					ariaLabel={t('currency')}
					disabled={!profile.showPrices}
					onChange={(value) => {
						markSaving();
						updateProfile({ priceCurrency: value });
					}}
				/>
			</div>
		</SettingsSection>
	);
}
