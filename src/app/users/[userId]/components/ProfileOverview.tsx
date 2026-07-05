'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/profile/types';
import type { DeckMeta } from '@/types/decks';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { getScryfallCardImageUriBySize } from '@/lib/scryfall/utils/scryfall-query';
import { scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { useDeckSummaries } from '@/app/decks/useDeckSummaries';
import type { ProfileSummary } from '../useProfileSummary';
import { useProfileOverview } from '../useProfileOverview';
import styles from './ProfileOverview.module.css';

const RECENT_DECKS_LIMIT = 5;

/** "juil. 2026"-style month+year from an ISO date (French locale). */
function formatMemberSince(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

/**
 * Overview tab of the profile shell: a public dashboard. Recap stats (unique
 * cards / total copies / member since), a "recently added" card strip, and a
 * "recently updated decks" list. Public and identical for owner and visitor —
 * no editing here. Total copies and the deck list are passed in from the shell's
 * summary; unique count and recent cards come from useProfileOverview.
 */
export function ProfileOverview({
	ownerId,
	profile,
	summary,
}: {
	ownerId: string;
	profile: Profile | null;
	summary: ProfileSummary;
}) {
	const router = useRouter();
	const { uniqueCount, recentCards, isLoading } = useProfileOverview(ownerId);
	const { stacks } = useCollectionCards(recentCards);

	// Newest-first, capped. Sort a copy — never mutate summary.decks in place.
	const recentDecks: DeckMeta[] = useMemo(
		() =>
			[...summary.decks]
				.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
				.slice(0, RECENT_DECKS_LIMIT),
		[summary.decks]
	);

	// Reuse the exact deck-preview component from the Decks tab (read-only).
	const symbolMap = useScryfallSymbols();
	const deckSummaryMap = useDeckSummaries(recentDecks);

	const totalCopies = summary.collectionCount;
	const memberSince = profile ? formatMemberSince(profile.createdAt) : '—';

	return (
		<div className={styles.overview}>
			<section className={styles.statsGrid} aria-label="Statistiques">
				<div className={styles.statCard}>
					<span className={styles.statValue}>{isLoading ? '—' : uniqueCount}</span>
					<span className={styles.statLabel}>Cartes uniques</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statValue}>{summary.isLoading ? '—' : totalCopies}</span>
					<span className={styles.statLabel}>Exemplaires</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statValue}>{memberSince}</span>
					<span className={styles.statLabel}>Membre depuis</span>
				</div>
			</section>

			<section className={styles.block} aria-label="Cartes récemment ajoutées">
				<h2 className={styles.blockTitle}>Récemment ajoutées</h2>
				{!isLoading && recentCards.length === 0 ? (
					<p className={styles.empty}>Aucune carte publique pour l&apos;instant.</p>
				) : (
					<div className={styles.cardStrip}>
						{stacks.slice(0, recentCards.length).map((stack) => {
							const card = stack.cards[0];
							const src = getScryfallCardImageUriBySize(card, 'normal');
							return (
								<div key={card.entry.rowId} className={styles.cardThumb} title={card.name}>
									{src ? (
										<Image
											loader={scryfallImageLoader}
											src={src}
											alt={card.name}
											width={244}
											height={340}
											className={styles.cardImg}
										/>
									) : (
										<span className={styles.cardName}>{card.name}</span>
									)}
								</div>
							);
						})}
					</div>
				)}
			</section>

			<section className={styles.block} aria-label="Decks récemment modifiés">
				<h2 className={styles.blockTitle}>Decks récents</h2>
				{recentDecks.length === 0 ? (
					<p className={styles.empty}>Aucun deck pour l&apos;instant.</p>
				) : (
					<div className={styles.deckGrid}>
						{recentDecks.map((deck) => (
							<DeckCard
								key={deck.id}
								deck={deck}
								summary={deckSummaryMap[deck.id]}
								symbolMap={symbolMap}
								readOnly
								onClick={() => router.push(`/decks/${deck.id}`)}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
