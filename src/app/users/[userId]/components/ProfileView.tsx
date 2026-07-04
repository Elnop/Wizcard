'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/profile/types';
import type { DeckMeta } from '@/types/decks';
import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { Button } from '@/components/Button/Button';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { useProfileSummary, PREVIEW_LIMIT } from '../useProfileSummary';
import { PublicCollectionView } from '../collection/page';
import { PublicWishlistView } from '../wishlist/page';
import { useHideOnScrollDown } from './useHideOnScrollDown';
import styles from './ProfileView.module.css';

type Tab = 'decks' | 'collection' | 'wishlist';

/**
 * Instagram-style profile: header (avatar / name / bio) + a stats row of
 * section counts, then tabs that switch between deck / collection / wishlist
 * previews inline. Never receives or renders an email — only public fields.
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
	const router = useRouter();
	const symbolMap = useScryfallSymbols();
	const summary = useProfileSummary(userId);
	const [tab, setTab] = useState<Tab>('decks');
	const headerVisible = useHideOnScrollDown();

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

	const stats: Array<{ key: Tab; label: string; count: number }> = [
		{ key: 'decks', label: 'Decks', count: summary.deckCount },
		{ key: 'collection', label: 'Collection', count: summary.collectionCount },
		{ key: 'wishlist', label: 'Wishlist', count: summary.wishlistCount },
	];

	return (
		<div className={styles.container}>
			<div className={`${styles.stickyBar} ${headerVisible ? '' : styles.stickyBarHidden}`}>
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

				{/* Tab bar with counts */}
				<div className={styles.tabs} role="tablist">
					{stats.map((s) => (
						<button
							key={s.key}
							type="button"
							role="tab"
							aria-selected={tab === s.key}
							className={`${styles.tab} ${tab === s.key ? styles.tabActive : ''}`}
							onClick={() => setTab(s.key)}
						>
							{s.label}
							<span className={styles.tabCount}>{summary.isLoading ? '—' : s.count}</span>
						</button>
					))}
				</div>
			</div>

			<div className={styles.tabPanel}>
				{tab === 'decks' && (
					<DecksTab
						decks={summary.decks}
						symbolMap={symbolMap}
						isLoading={summary.isLoading}
						handle={urlHandle}
						onOpen={(id) => router.push(`/decks/${id}`)}
					/>
				)}
				{/* Collection / wishlist tabs render the full browsing view (search +
				    filters + grid) lazily — only mounted when their tab is active, so
				    opening the profile doesn't fetch a whole collection up front. */}
				{tab === 'collection' && <PublicCollectionView ownerId={userId} filterLayout="modal" />}
				{tab === 'wishlist' && <PublicWishlistView ownerId={userId} filterLayout="modal" />}
			</div>
		</div>
	);
}

function DecksTab({
	decks,
	symbolMap,
	isLoading,
	handle,
	onOpen,
}: {
	decks: DeckMeta[];
	symbolMap: Record<string, ScryfallCardSymbol>;
	isLoading: boolean;
	handle: string;
	onOpen: (id: string) => void;
}) {
	if (!isLoading && decks.length === 0) {
		return <p className={styles.emptyText}>No decks yet.</p>;
	}
	const shown = decks.slice(0, PREVIEW_LIMIT);
	return (
		<>
			<div className={styles.deckGrid}>
				{shown.map((deck) => (
					<DeckCard
						key={deck.id}
						deck={deck}
						symbolMap={symbolMap}
						readOnly
						onClick={() => onOpen(deck.id)}
					/>
				))}
			</div>
			{decks.length > PREVIEW_LIMIT && (
				<Link href={`/users/${handle}/decks`} className={styles.seeAll}>
					See all {decks.length} →
				</Link>
			)}
		</>
	);
}
