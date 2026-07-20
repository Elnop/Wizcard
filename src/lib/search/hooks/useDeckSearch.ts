'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchDecks, type DeckSearchResult } from '@/lib/search/db/searchDecks';
import type { DeckSearchFilters } from '@/lib/search/types';

const PAGE = 24;

export function useDeckSearch(filters: DeckSearchFilters, enabled = true) {
	const [decks, setDecks] = useState<DeckSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);
	const key = JSON.stringify(filters);

	useEffect(() => {
		// La landing monte ce hook sans terme de recherche : sans ce court-circuit
		// elle émettrait une requête pour une section qui n'affiche que du texte
		// de présentation.
		if (!enabled) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- clears state when disabled
			setDecks([]);
			setTotal(0);
			offsetRef.current = 0;
			return;
		}
		let cancelled = false;

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
	}, [key, enabled]);

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
