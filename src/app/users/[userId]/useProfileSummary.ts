'use client';

import { useEffect, useState } from 'react';
import type { DeckMeta } from '@/types/decks';
import type { CardEntry } from '@/types/cards';
import { fetchDecks } from '@/lib/deck/db/decks';
import {
	fetchPublicWishlistCardRowsPage,
	fetchPublicCardCount,
} from '@/lib/supabase/queries/cards';
import { fetchPublicCollectionPage } from '@/lib/collection/db/collection';
import { rowToCardEntry } from '@/lib/card/db/cardRow';

export type CardPreview = { scryfallId: string; entry: CardEntry };

export type ProfileSummary = {
	decks: DeckMeta[];
	deckCount: number;
	collectionPreview: CardPreview[];
	collectionCount: number;
	wishlistPreview: CardPreview[];
	wishlistCount: number;
	isLoading: boolean;
};

/** How many thumbnails each section shows on the profile before "See all". */
export const PREVIEW_LIMIT = 12;

/**
 * Loads the three-section summary the profile page shows: deck list (small,
 * loaded fully), plus a capped preview + exact count for collection and
 * wishlist (so large collections aren't fully fetched here — the dedicated
 * pages handle that). All reads rely on the public SELECT policy.
 */
export function useProfileSummary(ownerId: string): ProfileSummary {
	const [state, setState] = useState<Omit<ProfileSummary, 'isLoading'>>({
		decks: [],
		deckCount: 0,
		collectionPreview: [],
		collectionCount: 0,
		wishlistPreview: [],
		wishlistCount: 0,
	});
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			const [decks, collectionFirst, wishlistFirst, collectionCount, wishlistCount] =
				await Promise.all([
					fetchDecks(ownerId),
					fetchPublicCollectionPage(ownerId, 0),
					fetchPublicWishlistCardRowsPage(ownerId, 0, PREVIEW_LIMIT),
					fetchPublicCardCount(ownerId, false),
					fetchPublicCardCount(ownerId, true),
				]);
			if (cancelled) return;
			setState({
				decks,
				deckCount: decks.length,
				collectionPreview: collectionFirst.rows.slice(0, PREVIEW_LIMIT),
				collectionCount,
				wishlistPreview: wishlistFirst.rows.map((row) => ({
					scryfallId: row.scryfall_id,
					entry: rowToCardEntry(row),
				})),
				wishlistCount,
			});
			setIsLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [ownerId]);

	return { ...state, isLoading };
}
