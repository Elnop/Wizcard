'use client';

import { useEffect, useState } from 'react';
import type { CardEntry } from '@/types/cards';
import { fetchDistinctPublicCardCount } from '@/lib/supabase/queries/cards';
import { fetchRecentPublicCards } from '@/lib/collection/db/collection';

/** How many recently-added cards the Overview strip shows. */
export const RECENT_CARDS_LIMIT = 8;

type RecentCard = { scryfallId: string; entry: CardEntry };

/**
 * Overview-only reads: the exact unique-print count (distinct scryfall_id) and
 * the most recently added public cards. Total copies and the deck list already
 * come from useProfileSummary in the shell, so they are NOT fetched here.
 */
export function useProfileOverview(ownerId: string): {
	uniqueCount: number;
	recentCards: RecentCard[];
	isLoading: boolean;
} {
	const [uniqueCount, setUniqueCount] = useState(0);
	const [recentCards, setRecentCards] = useState<RecentCard[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			const [count, recent] = await Promise.all([
				fetchDistinctPublicCardCount(ownerId),
				fetchRecentPublicCards(ownerId, RECENT_CARDS_LIMIT),
			]);
			if (cancelled) return;
			setUniqueCount(count);
			setRecentCards(recent);
			setIsLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [ownerId]);

	return { uniqueCount, recentCards, isLoading };
}
