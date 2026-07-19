'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ProfileSearchResult } from '@/lib/search/db/searchProfiles';
import type { ProfileStats } from '@/lib/search/db/searchProfiles';
import styles from './ProfileCard.module.css';

type Props = { profile: ProfileSearchResult; stats?: ProfileStats };

/**
 * Profile search hit rendered as a "hero" card: a large avatar image on top,
 * then nickname, description and a footer with deck/card stats plus a
 * "view profile" affordance. Links to `/users/[nickname]` (the route segment
 * is named `[userId]` but resolves by nickname — see `useProfileByNickname`).
 * A profile without a nickname has no public URL, so it renders non-clickable.
 *
 * Avatars are served from Supabase storage (a different host than the scryfall
 * image hosts whitelisted in `next.config.ts` `images.remotePatterns` and CSP
 * `img-src`), so a plain `<img>` is used instead of `next/image`. When there is
 * no avatar, the hero becomes a gradient with the nickname's initial.
 */
function DeckIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2.5" y="2" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path
				d="M5.5 4.5h4M13 4.5v9a1 1 0 0 1-1 1H6"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CardsIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2" y="3" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path d="M5 5.5h3M5 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

export function ProfileCard({ profile, stats }: Props) {
	const t = useTranslations('search');

	const content = (
		<>
			{/* Image layer: framed (inset) at rest, expands to full-bleed on hover. */}
			<div className={styles.imgLayer}>
				{profile.avatarUrl ? (
					// eslint-disable-next-line @next/next/no-img-element -- Supabase storage host isn't whitelisted for next/image
					<img src={profile.avatarUrl} alt="" className={styles.heroImg} />
				) : (
					<span className={styles.heroInitial}>
						{(profile.nickname ?? '?').charAt(0).toUpperCase()}
					</span>
				)}
			</div>

			{/* Spacer that reserves the image height, pushing content to the bottom. */}
			<div className={styles.spacer} />

			{/* Foreground content. A scrim behind it fades in on hover so the text
			    stays legible once the image expands underneath. */}
			<div className={styles.content}>
				<div className={styles.scrim} />
				<div className={styles.contentInner}>
					<span className={styles.nickname}>{profile.nickname ?? '—'}</span>
					{profile.description && <p className={styles.description}>{profile.description}</p>}

					<div className={styles.footer}>
						{stats && (
							<div className={styles.stats}>
								<span className={styles.stat}>
									<DeckIcon />
									{stats.deckCount}
								</span>
								<span className={styles.stat}>
									<CardsIcon />
									{stats.cardCount}
								</span>
							</div>
						)}
						{profile.nickname && <span className={styles.viewBtn}>{t('viewProfile')}</span>}
					</div>
				</div>
			</div>
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
