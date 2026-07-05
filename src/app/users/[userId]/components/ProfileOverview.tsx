'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/profile/types';
import type { CardStack } from '@/types/cards';
import type { DeckMeta } from '@/types/decks';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { useDeckSummaries } from '@/app/decks/useDeckSummaries';
import { useCardModalContext } from '@/contexts/CardModalProvider';
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
	const { openCardModal } = useCardModalContext();
	const { uniqueCount, recentCards, isLoading } = useProfileOverview(ownerId);
	const { stacks } = useCollectionCards(recentCards);

	// One representative card per stack for CardList, plus a lookup back to the
	// stack so a click can open the (read-only) modal with all its copies.
	const recentReps = useMemo(
		() =>
			stacks
				.slice(0, recentCards.length)
				.map((s) => s.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[stacks, recentCards.length]
	);
	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [stacks]);

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
					<CardList
						cards={recentReps}
						isLoading={isLoading}
						skeletonCount={recentCards.length || undefined}
						viewModes={['grid']}
						onCardClick={(card: AnyCard) => {
							const stack = stackByCardId.get(card.id);
							if (stack) openCardModal(stack.cards, { readOnly: true });
						}}
					/>
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
