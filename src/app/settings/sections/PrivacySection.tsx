'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function PrivacySection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Confidentialité" status={status}>
			<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
				<input
					type="checkbox"
					checked={profile.isPublic}
					onChange={(e) => {
						markSaving();
						updateProfile({ isPublic: e.target.checked });
					}}
				/>
				<span>Profil public</span>
			</label>
			<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
				Lorsque votre profil est privé, votre page publique et vos collections partagées ne sont
				plus visibles par les autres utilisateurs.
			</p>
		</SettingsSection>
	);
}
