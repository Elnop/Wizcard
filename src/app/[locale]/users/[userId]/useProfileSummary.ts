'use client';

import { useEffect, useState } from 'react';
import type { DeckMeta } from '@/types/decks';
import { fetchDecks } from '@/lib/deck/db/decks';
import { fetchPublicCardCount } from '@/lib/supabase/queries/cards';

export type ProfileSummary = {
	decks: DeckMeta[];
	deckCount: number;
	collectionCount: number;
	wishlistCount: number;
	isLoading: boolean;
};

/**
 * Loads what the profile header/tabs need: the deck list (small, loaded fully,
 * for the Decks tab) plus the exact collection and wishlist counts for the tab
 * badges. The full collection/wishlist card lists are loaded lazily by their
 * own tabs, not here. All reads rely on the public SELECT policy.
 */
export function useProfileSummary(ownerId: string): ProfileSummary {
	const [state, setState] = useState<Omit<ProfileSummary, 'isLoading'>>({
		decks: [],
		deckCount: 0,
		collectionCount: 0,
		wishlistCount: 0,
	});
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!ownerId) {
			// No owner resolved yet — nothing to load; don't hit the DB with an empty id.
			return;
		}
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			const [decks, collectionCount, wishlistCount] = await Promise.all([
				fetchDecks(ownerId),
				fetchPublicCardCount(ownerId, false),
				fetchPublicCardCount(ownerId, true),
			]);
			if (cancelled) return;
			setState({
				decks,
				deckCount: decks.length,
				collectionCount,
				wishlistCount,
			});
			setIsLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [ownerId]);

	// While no owner id is resolved yet, report not-loading (nothing to load)
	// rather than the `useState(true)` initial value, without an extra
	// synchronous setState in the effect.
	return { ...state, isLoading: ownerId ? isLoading : false };
}
