'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

const LANGUAGES: { value: Language; label: string }[] = [
	{ value: 'fr', label: 'Français' },
	{ value: 'en', label: 'English' },
];

export function LanguageSection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Langue" status={status}>
			<label>
				<span>Langue des cartes et de l&apos;interface</span>
				<select
					value={profile.language}
					onChange={(e) => {
						markSaving();
						updateProfile({ language: e.target.value as Language });
					}}
				>
					{LANGUAGES.map((l) => (
						<option key={l.value} value={l.value}>
							{l.label}
						</option>
					))}
				</select>
			</label>
			<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
				La traduction de l&apos;interface arrive bientôt. Ce réglage s&apos;applique
				aujourd&apos;hui à l&apos;affichage des cartes.
			</p>
		</SettingsSection>
	);
}
