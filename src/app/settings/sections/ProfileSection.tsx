'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { isNicknameTaken, uploadAvatar } from '@/lib/profile/db/profiles';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function ProfileSection() {
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	const [nickname, setNickname] = useState(profile?.nickname ?? '');
	const [description, setDescription] = useState(profile?.description ?? '');
	const [nicknameError, setNicknameError] = useState<string | null>(null);
	const [avatarBusy, setAvatarBusy] = useState(false);

	if (!profile || !user) return null;

	const commitNickname = async () => {
		const trimmed = nickname.trim();
		setNicknameError(null);
		if (trimmed === (profile.nickname ?? '')) return;
		// Only the retired modal's rule: a non-empty, changed nickname must be
		// free (case-insensitive); an empty nickname is allowed and clears it.
		if (trimmed) {
			try {
				if (await isNicknameTaken(trimmed, user.id)) {
					setNicknameError('Ce pseudo est déjà pris.');
					return;
				}
			} catch {
				setNicknameError('Impossible de vérifier le pseudo pour le moment.');
				return;
			}
		}
		markSaving();
		updateProfile({ nickname: trimmed || null });
	};

	const commitDescription = () => {
		if (description === (profile.description ?? '')) return;
		markSaving();
		updateProfile({ description: description.trim() || null });
	};

	const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setAvatarBusy(true);
		try {
			const url = await uploadAvatar(user.id, file);
			markSaving();
			updateProfile({ avatarUrl: url });
		} finally {
			setAvatarBusy(false);
		}
	};

	return (
		<SettingsSection title="Profil" status={status}>
			<label>
				<span>Pseudo</span>
				<input
					value={nickname}
					onChange={(e) => setNickname(e.target.value)}
					onBlur={commitNickname}
					placeholder="Votre nom d'affichage"
					maxLength={50}
				/>
			</label>
			{nicknameError && (
				<span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{nicknameError}</span>
			)}

			<label>
				<span>Description</span>
				<textarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					onBlur={commitDescription}
					placeholder="Parlez de vous aux autres sorciers..."
					rows={4}
					maxLength={500}
				/>
			</label>

			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				{profile.avatarUrl && (
					<Image
						src={profile.avatarUrl}
						alt="Avatar"
						width={64}
						height={64}
						style={{ borderRadius: '50%', objectFit: 'cover' }}
						unoptimized
					/>
				)}
				<label>
					<span>{avatarBusy ? 'Téléversement…' : 'Changer l’avatar'}</span>
					<input type="file" accept="image/*" onChange={onAvatarChange} disabled={avatarBusy} />
				</label>
			</div>
		</SettingsSection>
	);
}
