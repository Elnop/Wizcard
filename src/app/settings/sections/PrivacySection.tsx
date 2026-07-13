'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function PrivacySection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Confidentialité" status={status}>
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
				<span>Profil public</span>
			</label>
			<p className={s.hint}>
				Lorsque votre profil est privé, votre page publique ainsi que vos decks, collection et liste
				de souhaits ne sont plus visibles par les autres utilisateurs.
			</p>
		</SettingsSection>
	);
}
