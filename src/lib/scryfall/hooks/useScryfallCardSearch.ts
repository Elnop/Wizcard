'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { searchCards } from '@/lib/scryfall/endpoints/cards';
import { buildScryfallQuery } from '@/lib/scryfall/utils/scryfall-query';
import { ScryfallApiError } from '@/lib/scryfall/utils/errors';
import { useDebounce } from '@/lib/search/hooks/useDebounce';

export interface SearchFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type: string;
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order?: ScryfallSortOrder;
	dir?: ScryfallSortDir;
}

interface UseScryfallCardSearchResult {
	cards: ScryfallCard[];
	isLoading: boolean;
	isLoadingMore: boolean;
	error: Error | null;
	hasMore: boolean;
	totalCards: number;
	loadMore: () => void;
	reset: () => void;
}

export function useScryfallCardSearch(filters: SearchFilters): UseScryfallCardSearchResult {
	const [cards, setCards] = useState<ScryfallCard[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [totalCards, setTotalCards] = useState(0);
	const [page, setPage] = useState(1);

	const debouncedName = useDebounce(filters.name, 300);
	const lastSearchKeyRef = useRef<string>('');
	const abortControllerRef = useRef<AbortController | null>(null);

	const order = filters.order ?? 'name';
	const dir = filters.dir ?? 'auto';

	const buildQuery = useCallback(
		(name: string) => {
			return buildScryfallQuery({
				name: name || undefined,
				colors: filters.colors.length > 0 ? filters.colors : undefined,
				colorMatch: filters.colorMatch,
				type: filters.type || undefined,
				set: filters.set || undefined,
				rarities: filters.rarities.length > 0 ? filters.rarities : undefined,
				text: filters.oracleText || undefined,
				cmc: filters.cmc || undefined,
			});
		},
		[
			filters.colors,
			filters.colorMatch,
			filters.type,
			filters.set,
			filters.rarities,
			filters.oracleText,
			filters.cmc,
		]
	);

	const fetchCards = useCallback(
		async (query: string, pageNum: number, isNewSearch: boolean) => {
			if (isNewSearch) {
				abortControllerRef.current?.abort();
				abortControllerRef.current = new AbortController();
			}
			const signal = abortControllerRef.current?.signal;

			if (!query.trim()) {
				setCards([]);
				setHasMore(false);
				setTotalCards(0);
				return;
			}

			try {
				if (isNewSearch) {
					setIsLoading(true);
				} else {
					setIsLoadingMore(true);
				}
				setError(null);

				const result = await searchCards({ q: query, page: pageNum, order, dir }, signal);

				if (isNewSearch) {
					setCards(result.data);
				} else {
					setCards((prev) => [...prev, ...result.data]);
				}

				setHasMore(result.has_more);
				setTotalCards(result.total_cards ?? result.data.length);
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				if (err instanceof ScryfallApiError && err.status === 404) {
					setCards([]);
					setHasMore(false);
					setTotalCards(0);
					return;
				}
				setError(err instanceof Error ? err : new Error('Search failed'));
				if (isNewSearch) {
					setCards([]);
					setHasMore(false);
					setTotalCards(0);
				}
			} finally {
				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[order, dir]
	);

	useEffect(() => {
		const query = buildQuery(debouncedName);
		// Include order and dir in the search key to trigger re-fetch when they change
		const searchKey = `${query}|${order}|${dir}`;

		if (searchKey !== lastSearchKeyRef.current) {
			lastSearchKeyRef.current = searchKey;
			setPage(1);
			fetchCards(query, 1, true);
		}
	}, [debouncedName, buildQuery, fetchCards, order, dir]);

	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	const lastQueryRef = useRef<string>('');

	const loadMore = useCallback(() => {
		if (!isLoading && !isLoadingMore && hasMore) {
			const nextPage = page + 1;
			setPage(nextPage);
			// Extract only the query part from the search key for loadMore
			const query = lastSearchKeyRef.current.split('|')[0];
			lastQueryRef.current = query;
			fetchCards(query, nextPage, false);
		}
	}, [isLoading, isLoadingMore, hasMore, page, fetchCards]);

	const reset = useCallback(() => {
		setCards([]);
		setPage(1);
		setHasMore(false);
		setTotalCards(0);
		setError(null);
		lastQueryRef.current = '';
	}, []);

	return {
		cards,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		totalCards,
		loadMore,
		reset,
	};
}
