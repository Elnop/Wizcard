'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ProfileSearchResult } from '@/lib/search/db/searchProfiles';
import type { ProfileStats } from '@/lib/search/db/searchProfiles';
import styles from './ProfileCard.module.css';

type Props = { profile: ProfileSearchResult; stats?: ProfileStats };

/** Max tilt in degrees — matches CardImage so profile cards feel like real cards. */
const TILT_MAX_DEG = 10;

function DeckIcon() {
	return (
		<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
		<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2" y="3" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path d="M5 5.5h3M5 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

/** Phantom silhouette shown when a profile has no avatar. */
function GhostAvatar() {
	return (
		<svg
			className={styles.ghost}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			preserveAspectRatio="xMidYMid meet"
		>
			<circle cx="12" cy="8" r="4" fill="currentColor" />
			<path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor" />
		</svg>
	);
}

/**
 * Profile search hit rendered as an MTG-style card (63/88 ratio): a title bar
 * (nickname), an art window (avatar / ghost fallback), a type line, a text box
 * (description) and a bottom-right power/toughness-style stat badge. Hovering
 * tilts the card in 3D following the pointer, reusing CardImage's tilt approach.
 *
 * Links to `/users/[nickname]` (the route segment is named `[userId]` but
 * resolves by nickname). A profile without a nickname has no public URL, so it
 * renders non-clickable.
 *
 * Avatars come from Supabase storage (a different host than the scryfall image
 * hosts whitelisted in `next.config.ts` / CSP), so a plain `<img>` is used.
 */
export function ProfileCard({ profile, stats }: Props) {
	const t = useTranslations('search');
	const tiltRef = useRef<HTMLDivElement>(null);

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const el = tiltRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		el.style.setProperty('--tilt-duration', '0ms');
		el.style.setProperty('--tilt-x', `${(x - 0.5) * 2 * TILT_MAX_DEG}deg`);
		el.style.setProperty('--tilt-y', `${(0.5 - y) * 2 * TILT_MAX_DEG}deg`);
	};

	const handleMouseLeave = () => {
		const el = tiltRef.current;
		if (!el) return;
		el.style.setProperty('--tilt-duration', '500ms');
		el.style.setProperty('--tilt-x', '0deg');
		el.style.setProperty('--tilt-y', '0deg');
	};

	const inner = (
		<div
			ref={tiltRef}
			className={styles.tilt}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
		>
			<div className={styles.frame}>
				<div className={styles.titleBar}>
					<span className={styles.nickname}>{profile.nickname ?? '—'}</span>
				</div>

				<div className={styles.art}>
					{profile.avatarUrl ? (
						// eslint-disable-next-line @next/next/no-img-element -- Supabase storage host isn't whitelisted for next/image
						<img src={profile.avatarUrl} alt="" className={styles.artImg} />
					) : (
						<GhostAvatar />
					)}
				</div>

				<div className={styles.typeLine}>{t('profileTypeLine')}</div>

				<div className={styles.textBox}>
					<p className={styles.description}>{profile.description ?? ''}</p>
					{stats && (
						<div className={styles.ptBadge}>
							<span className={styles.stat}>
								<DeckIcon />
								{stats.deckCount}
							</span>
							<span className={styles.ptSlash}>/</span>
							<span className={styles.stat}>
								<CardsIcon />
								{stats.cardCount}
							</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);

	if (!profile.nickname) {
		return <div className={styles.card}>{inner}</div>;
	}

	return (
		<Link href={`/users/${encodeURIComponent(profile.nickname)}`} className={styles.card}>
			{inner}
		</Link>
	);
}
