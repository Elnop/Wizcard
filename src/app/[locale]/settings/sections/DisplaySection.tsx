'use client';

import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { PriceCurrency, ThemePreference } from '@/lib/profile/types';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

const THEMES: { value: ThemePreference; label: string }[] = [
	{ value: 'system', label: 'Système' },
	{ value: 'light', label: 'Clair' },
	{ value: 'dark', label: 'Sombre' },
];
const CURRENCIES: { value: PriceCurrency; label: string }[] = [
	{ value: 'eur', label: '€ EUR (Cardmarket)' },
	{ value: 'usd', label: '$ USD (TCGplayer)' },
];

export function DisplaySection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Affichage" status={status}>
			<div className={s.field}>
				<span className={s.label}>Thème</span>
				<Select
					value={profile.themePreference}
					options={THEMES}
					ariaLabel="Thème"
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
				<span>Afficher les prix</span>
			</label>

			<div className={s.field}>
				<span className={s.label}>Devise</span>
				<Select
					value={profile.priceCurrency}
					options={CURRENCIES}
					ariaLabel="Devise"
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
