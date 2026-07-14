'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { isNicknameTaken, uploadAvatar } from '@/lib/profile/db/profiles';
import {
	normalizeNickname,
	validateNickname,
	NICKNAME_MIN,
	NICKNAME_MAX,
	type NicknameErrorCode,
} from '@/lib/profile/validation';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

const nicknameErrorKey = {
	tooShort: 'nicknameTooShort',
	tooLong: 'nicknameTooLong',
	invalidChars: 'nicknameInvalidChars',
	reserved: 'nicknameReserved',
} as const satisfies Record<NicknameErrorCode, string>;

export function ProfileSection() {
	const t = useTranslations('settings.profile');
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	const [nickname, setNickname] = useState(profile?.nickname ?? '');
	const [description, setDescription] = useState(profile?.description ?? '');
	const [nicknameError, setNicknameError] = useState<string | null>(null);
	const [avatarError, setAvatarError] = useState<string | null>(null);
	const [avatarBusy, setAvatarBusy] = useState(false);

	if (!profile || !user) return null;

	const commitNickname = async () => {
		const normalized = normalizeNickname(nickname);
		setNicknameError(null);
		// Reflect the normalized value back into the field so the user sees what is saved.
		if (normalized !== nickname) setNickname(normalized);
		if (normalized === (profile.nickname ?? '')) return;
		if (normalized) {
			const v = validateNickname(normalized);
			if (!v.ok) {
				setNicknameError(t(nicknameErrorKey[v.code], { min: NICKNAME_MIN, max: NICKNAME_MAX }));
				return;
			}
			try {
				if (await isNicknameTaken(normalized, user.id)) {
					setNicknameError(t('nicknameTaken'));
					return;
				}
			} catch {
				setNicknameError(t('nicknameCheckFailed'));
				return;
			}
		}
		markSaving();
		updateProfile({ nickname: normalized || null });
	};

	const commitDescription = () => {
		if (description === (profile.description ?? '')) return;
		markSaving();
		updateProfile({ description: description.trim() || null });
	};

	const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setAvatarError(null);
		setAvatarBusy(true);
		try {
			const url = await uploadAvatar(user.id, file);
			markSaving();
			updateProfile({ avatarUrl: url });
		} catch {
			setAvatarError(t('avatarUploadFailed'));
		} finally {
			setAvatarBusy(false);
		}
	};

	return (
		<SettingsSection title={t('title')} status={status}>
			<div className={s.field}>
				<span className={s.label}>{t('nickname')}</span>
				<input
					className={s.input}
					value={nickname}
					onChange={(e) => setNickname(e.target.value)}
					onBlur={commitNickname}
					placeholder={t('nicknamePlaceholder')}
					maxLength={NICKNAME_MAX}
				/>
				{nicknameError && <span className={s.errorText}>{nicknameError}</span>}
			</div>

			<div className={s.field}>
				<span className={s.label}>{t('description')}</span>
				<textarea
					className={s.textarea}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					onBlur={commitDescription}
					placeholder={t('descriptionPlaceholder')}
					rows={4}
					maxLength={500}
				/>
			</div>

			<div className={s.field}>
				<span className={s.label}>{t('avatar')}</span>
				<div className={s.avatarRow}>
					{profile.avatarUrl && (
						<Image
							src={profile.avatarUrl}
							alt={t('avatarAlt')}
							width={64}
							height={64}
							className={s.avatar}
							unoptimized
						/>
					)}
					<label className={s.fileTrigger}>
						{avatarBusy ? t('avatarUploading') : t('avatarChange')}
						<input type="file" accept="image/*" onChange={onAvatarChange} disabled={avatarBusy} />
					</label>
				</div>
				{avatarError && <span className={s.errorText}>{avatarError}</span>}
			</div>
		</SettingsSection>
	);
}
