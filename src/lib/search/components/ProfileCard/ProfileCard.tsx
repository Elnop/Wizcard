'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ProfileSearchResult } from '@/lib/search/db/searchProfiles';
import type { ProfileStats } from '@/lib/search/db/searchProfiles';
import styles from './ProfileCard.module.css';

type Props = { profile: ProfileSearchResult; stats?: ProfileStats };

/**
 * Vertical result card for a profile search hit. Links to `/users/[nickname]`
 * (the route segment is named `[userId]` but resolves by nickname — see
 * `useProfileByNickname`). A profile without a nickname has no public URL, so
 * the card renders non-clickable in that case.
 *
 * Avatars are served from Supabase storage (a different host than the scryfall
 * image hosts whitelisted in `next.config.ts` `images.remotePatterns` and CSP
 * `img-src`), so a plain `<img>` is used here instead of `next/image`.
 */
export function ProfileCard({ profile, stats }: Props) {
	const t = useTranslations('search');

	const content = (
		<>
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
			<span className={styles.nickname}>{profile.nickname ?? '—'}</span>
			{profile.description && <p className={styles.description}>{profile.description}</p>}
			{stats && (
				<div className={styles.stats}>
					<span>{t('statDecks', { count: stats.deckCount })}</span>
					<span className={styles.statDot} aria-hidden="true">
						·
					</span>
					<span>{t('statCards', { count: stats.cardCount })}</span>
				</div>
			)}
		</>
	);

	if (!profile.nickname) {
		return <div className={styles.card}>{content}</div>;
	}

	return (
		<Link href={`/users/${encodeURIComponent(profile.nickname)}`} className={styles.card}>
			{content}
		</Link>
	);
}
