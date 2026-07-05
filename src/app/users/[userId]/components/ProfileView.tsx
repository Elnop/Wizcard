'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Profile } from '@/lib/profile/types';
import { Button } from '@/components/Button/Button';
import type { ProfileSummary } from '../useProfileSummary';
import { useStickyHeader } from './useStickyHeader';
import styles from './ProfileView.module.css';

type Tab = 'decks' | 'collection' | 'wishlist';

/** Derive the active tab from the URL's last segment (defaults to decks). */
function tabFromPathname(pathname: string): Tab {
	if (pathname.endsWith('/collection')) return 'collection';
	if (pathname.endsWith('/wishlist')) return 'wishlist';
	return 'decks';
}

/**
 * Instagram-style profile shell: header (avatar / name / bio) + a stats row of
 * section counts, then tabs that are real links to `/users/<handle>/<tab>`. The
 * active tab's content is supplied as `children` by the users/[userId] layout,
 * so switching tabs is a real navigation with a shareable URL. Never receives or
 * renders an email — only public fields.
 */
export function ProfileView({
	userId,
	profile,
	isLoading = false,
	onEdit,
	handle,
	summary,
	children,
}: {
	userId: string;
	profile: Profile | null;
	isLoading?: boolean;
	/** Set (by the layout, only for the owner) to show the Edit-profile button. */
	onEdit?: () => void;
	/** URL nickname used to build tab hrefs. */
	handle: string;
	/** Section counts, loaded once by the layout and passed down. */
	summary: ProfileSummary;
	/** Active tab content, injected by the layout. */
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const activeTab = tabFromPathname(pathname);
	const barRef = useRef<HTMLDivElement>(null);
	const { pinned, visible } = useStickyHeader(barRef);

	// Show a skeleton until the profile loads, rather than flashing the "Wizard"
	// placeholder and then swapping in the real nickname.
	const loaded = profile !== null && !isLoading;
	const displayName = profile?.nickname || 'Wizard';

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

	const stats: Array<{ key: Tab; label: string; count: number }> = [
		{ key: 'decks', label: 'Decks', count: summary.deckCount },
		{ key: 'collection', label: 'Collection', count: summary.collectionCount },
		{ key: 'wishlist', label: 'Wishlist', count: summary.wishlistCount },
	];

	// `compact` = the sticky overlay: tabs only (no avatar / nickname / bio /
	// edit), so the pinned bar stays thin.
	const renderHeader = (compact: boolean) => (
		<>
			{!compact && (
				<>
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
				</>
			)}

			{/* Tab bar with counts — real links to the tab sub-routes. */}
			<div className={styles.tabs} role="tablist">
				{stats.map((s) => (
					<Link
						key={s.key}
						href={`/users/${handle}/${s.key}`}
						role="tab"
						aria-selected={activeTab === s.key}
						className={`${styles.tab} ${activeTab === s.key ? styles.tabActive : ''}`}
					>
						{s.label}
						<span className={styles.tabCount}>{summary.isLoading ? '—' : s.count}</span>
					</Link>
				))}
			</div>
		</>
	);

	const overlayClass = [styles.overlayBar, visible ? styles.overlayVisible : styles.overlayHidden]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={styles.container}>
			{/* Normal in-flow header at the top — never animates, scrolls away. */}
			<div ref={barRef}>{renderHeader(false)}</div>

			{/* Second overlay header that engages only once scrolled past the first,
			    sliding in/out on scroll direction. Compact = thin. */}
			{pinned && <div className={overlayClass}>{renderHeader(true)}</div>}

			<div className={styles.tabPanel}>{children}</div>
		</div>
	);
}
