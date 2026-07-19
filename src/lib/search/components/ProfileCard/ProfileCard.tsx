'use client';

import { Link } from '@/i18n/navigation';
import type { ProfileSearchResult } from '@/lib/search/db/searchProfiles';
import styles from './ProfileCard.module.css';

type Props = { profile: ProfileSearchResult };

/**
 * Result card for a profile search hit. Links to `/users/[nickname]` (the
 * route segment is named `[userId]` but resolves by nickname — see
 * `useProfileByNickname`). A profile without a nickname has no public URL,
 * so the card renders non-clickable in that case.
 *
 * Avatars are served from Supabase storage (a different host than the
 * scryfall image hosts whitelisted in `next.config.ts` `images.remotePatterns`
 * and CSP `img-src`), so a plain `<img>` is used here instead of `next/image`.
 */
export function ProfileCard({ profile }: Props) {
	const href = profile.nickname ? `/users/${encodeURIComponent(profile.nickname)}` : '#';

	return (
		<Link href={href} className={styles.card} aria-disabled={!profile.nickname}>
			<div className={styles.avatar}>
				{profile.avatarUrl ? (
					// eslint-disable-next-line @next/next/no-img-element -- Supabase storage host isn't whitelisted for next/image
					<img src={profile.avatarUrl} alt="" className={styles.avatarImg} />
				) : (
					<span className={styles.avatarFallback}>
						{(profile.nickname ?? '?').charAt(0).toUpperCase()}
					</span>
				)}
			</div>
			<div className={styles.body}>
				<span className={styles.nickname}>{profile.nickname ?? '—'}</span>
				{profile.description && <span className={styles.description}>{profile.description}</span>}
			</div>
		</Link>
	);
}
