'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { PriceCurrency, ThemePreference } from '@/lib/profile/types';
import { SettingsSection } from '../components/SettingsSection';
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
			<label>
				<span>Thème</span>
				<select
					value={profile.themePreference}
					onChange={(e) => {
						markSaving();
						updateProfile({ themePreference: e.target.value as ThemePreference });
					}}
				>
					{THEMES.map((t) => (
						<option key={t.value} value={t.value}>
							{t.label}
						</option>
					))}
				</select>
			</label>

			<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
				<input
					type="checkbox"
					checked={profile.showPrices}
					onChange={(e) => {
						markSaving();
						updateProfile({ showPrices: e.target.checked });
					}}
				/>
				<span>Afficher les prix</span>
			</label>

			<label>
				<span>Devise</span>
				<select
					value={profile.priceCurrency}
					disabled={!profile.showPrices}
					onChange={(e) => {
						markSaving();
						updateProfile({ priceCurrency: e.target.value as PriceCurrency });
					}}
				>
					{CURRENCIES.map((c) => (
						<option key={c.value} value={c.value}>
							{c.label}
						</option>
					))}
				</select>
			</label>
		</SettingsSection>
	);
}
