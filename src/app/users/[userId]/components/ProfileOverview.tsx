'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/profile/types';
import type { Card, CardStack } from '@/types/cards';
import type { DeckMeta } from '@/types/decks';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { useDeckSummaries } from '@/app/decks/useDeckSummaries';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { usePublicCollection } from '../collection/usePublicCollection';
import type { ProfileSummary } from '../useProfileSummary';
import { useProfileOverview } from '../useProfileOverview';
import styles from './ProfileOverview.module.css';

const RECENT_DECKS_LIMIT = 5;
const TOP_PRICED_LIMIT = 8;

/** "juil. 2026"-style month+year from an ISO date (French locale). */
function formatMemberSince(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

/**
 * Cardmarket (EUR) market price of a single copy, picking the foil price when the
 * copy is foil. Returns null when Scryfall has no EUR price (or the card isn't
 * hydrated yet), so such cards drop out of the "most expensive" ranking.
 */
function cardmarketPrice(card: Card): number | null {
	if (!('prices' in card) || !card.prices) return null;
	const raw = card.entry.isFoil ? (card.prices.eur_foil ?? card.prices.eur) : card.prices.eur;
	if (raw == null) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

/** French EUR formatting, e.g. "12,50 €". */
const eurFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

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

	// Whole public collection (paginated) → hydrated stacks, so we can rank every
	// card by Cardmarket (EUR) price. Loaded lazily in the background; the section
	// shows skeletons until fully loaded to avoid a shifting ranking.
	const { entries: allEntries, isFullyLoaded: collectionLoaded } = usePublicCollection(ownerId);
	const { stacks: allStacks } = useCollectionCards(allEntries);

	// Top cards by Cardmarket price, excluding proxies (no market value). One
	// representative copy per print, ranked desc; ties keep hydration order.
	const topPriced = useMemo(() => {
		const priced: Array<{ card: Card; stack: CardStack; price: number }> = [];
		for (const stack of allStacks) {
			const card = stack.cards.find((c) => !c.entry.proxy);
			if (!card) continue;
			const price = cardmarketPrice(card);
			if (price === null) continue;
			priced.push({ card, stack, price });
		}
		priced.sort((a, b) => b.price - a.price);
		return priced.slice(0, TOP_PRICED_LIMIT);
	}, [allStacks]);

	const topPricedCards = useMemo(() => topPriced.map((p) => p.card), [topPriced]);
	const priceByCardId = useMemo(() => {
		const map = new Map<string, number>();
		for (const p of topPriced) map.set(p.card.id, p.price);
		return map;
	}, [topPriced]);
	const stackByTopCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const p of topPriced) map.set(p.card.id, p.stack);
		return map;
	}, [topPriced]);

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

			<section className={styles.block} aria-label="Cartes les plus chères">
				<h2 className={styles.blockTitle}>Cartes les plus chères</h2>
				{collectionLoaded && topPriced.length === 0 ? (
					<p className={styles.empty}>Aucune carte avec un prix Cardmarket.</p>
				) : (
					<CardList
						cards={topPricedCards}
						isLoading={!collectionLoaded}
						skeletonCount={TOP_PRICED_LIMIT}
						viewModes={['grid']}
						onCardClick={(card: AnyCard) => {
							const stack = stackByTopCardId.get(card.id);
							if (stack) openCardModal(stack.cards, { readOnly: true });
						}}
						renderOverlay={(card) => {
							const price = priceByCardId.get(card.id);
							return withCustomBadge(
								card,
								price != null ? (
									<span className={styles.priceBadge}>{eurFormat.format(price)}</span>
								) : undefined
							);
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
