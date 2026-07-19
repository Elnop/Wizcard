'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchDecks, type DeckSearchResult } from '@/lib/search/db/searchDecks';
import type { DeckSearchFilters } from '@/lib/search/types';

const PAGE = 24;

export function useDeckSearch(filters: DeckSearchFilters) {
	const [decks, setDecks] = useState<DeckSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);
	const key = JSON.stringify(filters);

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- initializes loading state for async search
		setIsLoading(true);
		offsetRef.current = 0;
		searchDecks(filters, { limit: PAGE, offset: 0 })
			.then((res) => {
				if (cancelled) return;
				setDecks(res.decks);
				setTotal(res.total);
				offsetRef.current = res.decks.length;
			})
			.catch(() => {
				if (!cancelled) {
					setDecks([]);
					setTotal(0);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	const loadMore = useCallback(() => {
		if (isLoadingMore || decks.length >= total) return;
		setIsLoadingMore(true);
		searchDecks(filters, { limit: PAGE, offset: offsetRef.current })
			.then((res) => {
				setDecks((prev) => [...prev, ...res.decks]);
				offsetRef.current += res.decks.length;
			})
			.catch(() => {})
			.finally(() => setIsLoadingMore(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, isLoadingMore, decks.length, total]);

	return {
		decks,
		isLoading,
		isLoadingMore,
		hasMore: decks.length < total,
		total,
		loadMore,
	};
}
