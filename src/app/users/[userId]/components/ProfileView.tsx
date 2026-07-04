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
	isLoading = false,
	onEdit,
}: {
	userId: string;
	profile: Profile | null;
	isLoading?: boolean;
	onEdit?: () => void;
}) {
	// Show a skeleton until the profile loads, rather than flashing the "Wizard"
	// placeholder and then swapping in the real nickname.
	const loaded = profile !== null && !isLoading;
	const displayName = profile?.nickname || 'Wizard';
	// URLs are keyed by nickname; fall back to the id only if a nickname is
	// somehow missing (every user gets a generated one).
	const urlHandle = profile?.nickname || userId;

	let avatarNode: React.ReactNode;
	if (!loaded) {
		avatarNode = (
			<span className={`${styles.avatarFallback} ${styles.skeletonAvatar}`} aria-hidden />
		);
	} else if (profile?.avatarUrl) {
		avatarNode = (
			// eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL
			<img src={profile.avatarUrl} alt="" className={styles.avatar} />
		);
	} else {
		avatarNode = (
			<span className={styles.avatarFallback}>{displayName.charAt(0).toUpperCase()}</span>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				{avatarNode}
				<div className={styles.headerText}>
					{!loaded ? (
						<span className={styles.skeletonName} aria-hidden />
					) : (
						<h1 className={styles.name}>{displayName}</h1>
					)}
					{onEdit && (
						<Button variant="secondary" size="sm" onClick={onEdit}>
							Edit profile
						</Button>
					)}
				</div>
			</div>
			{profile?.description && <p className={styles.description}>{profile.description}</p>}
			<div className={styles.links}>
				<Link href={`/users/${urlHandle}/decks`} className={styles.link}>
					Decks
				</Link>
				<Link href={`/users/${urlHandle}/collection`} className={styles.link}>
					Collection
				</Link>
				<Link href={`/users/${urlHandle}/wishlist`} className={styles.link}>
					Wishlist
				</Link>
			</div>
		</div>
	);
}
