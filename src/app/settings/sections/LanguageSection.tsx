'use client';

import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
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
			<div className={s.field}>
				<span className={s.label}>Langue des cartes et de l&apos;interface</span>
				<Select
					value={profile.language}
					options={LANGUAGES}
					ariaLabel="Langue des cartes et de l'interface"
					onChange={(value) => {
						markSaving();
						updateProfile({ language: value });
					}}
				/>
			</div>
			<p className={s.hint}>
				La traduction de l&apos;interface arrive bientôt. Ce réglage s&apos;applique
				aujourd&apos;hui à l&apos;affichage des cartes.
			</p>
		</SettingsSection>
	);
}
