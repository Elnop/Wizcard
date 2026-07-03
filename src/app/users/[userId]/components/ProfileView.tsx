'use client';

import Link from 'next/link';
import type { Profile } from '@/lib/profile/types';
import { Button } from '@/components/Button/Button';
import styles from './ProfileView.module.css';

/**
 * Presentational, read-only profile display. Never receives or renders an
 * email — non-owner visitors only get `userId` and the public `profile`
 * fields (nickname/description/avatarUrl), so there is nothing to leak here.
 */
export function ProfileView({
	userId,
	profile,
	onEdit,
}: {
	userId: string;
	profile: Profile | null;
	onEdit?: () => void;
}) {
	const displayName = profile?.nickname || 'Wizard';
	return (
		<div className={styles.container}>
			<div className={styles.header}>
				{profile?.avatarUrl ? (
					// eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL
					<img src={profile.avatarUrl} alt="" className={styles.avatar} />
				) : (
					<span className={styles.avatarFallback}>{displayName.charAt(0).toUpperCase()}</span>
				)}
				<div className={styles.headerText}>
					<h1 className={styles.name}>{displayName}</h1>
					{onEdit && (
						<Button variant="secondary" size="sm" onClick={onEdit}>
							Edit profile
						</Button>
					)}
				</div>
			</div>
			{profile?.description && <p className={styles.description}>{profile.description}</p>}
			<div className={styles.links}>
				<Link href={`/users/${userId}/decks`} className={styles.link}>
					Decks
				</Link>
				<Link href={`/users/${userId}/collection`} className={styles.link}>
					Collection
				</Link>
			</div>
		</div>
	);
}
