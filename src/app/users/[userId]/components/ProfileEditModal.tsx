'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { uploadAvatar } from '@/lib/profile/db/profiles';
import styles from './ProfileEditModal.module.css';

export function ProfileEditModal({ onClose }: { onClose: () => void }) {
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const [nickname, setNickname] = useState(profile?.nickname ?? '');
	const [description, setDescription] = useState(profile?.description ?? '');
	const [file, setFile] = useState<File | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!user) return;
		setIsSaving(true);
		setError(null);
		try {
			let avatarUrl: string | undefined;
			if (file) avatarUrl = await uploadAvatar(user.id, file);
			updateProfile({
				nickname: nickname.trim() || null,
				description: description.trim() || null,
				...(avatarUrl !== undefined ? { avatarUrl } : {}),
			});
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save profile');
			setIsSaving(false);
		}
	}

	return (
		<Modal onClose={onClose} className={styles.dialog}>
			<form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
				<h2 className={styles.title}>Edit profile</h2>
				<label className={styles.label}>
					Nickname
					<input
						type="text"
						className={styles.input}
						value={nickname}
						onChange={(e) => setNickname(e.target.value)}
						placeholder="Your display name"
						maxLength={50}
						autoFocus
					/>
				</label>
				<label className={styles.label}>
					Description
					<textarea
						className={styles.textarea}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Tell other wizards about yourself..."
						rows={4}
						maxLength={500}
					/>
				</label>
				<label className={styles.label}>
					Avatar
					<input
						type="file"
						accept="image/*"
						className={styles.fileInput}
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					/>
				</label>
				{error && <p className={styles.error}>{error}</p>}
				<div className={styles.actions}>
					<Button type="button" variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" isLoading={isSaving}>
						Save
					</Button>
				</div>
			</form>
		</Modal>
	);
}
