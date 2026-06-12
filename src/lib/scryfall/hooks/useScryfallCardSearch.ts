'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { searchCards } from '@/lib/scryfall/endpoints/cards';
import { buildScryfallQuery } from '@/lib/scryfall/utils/scryfall-query';
import { ScryfallApiError } from '@/lib/scryfall/utils/errors';
import { useDebounce } from '@/lib/search/hooks/useDebounce';

export const DEFAULT_QUERY = 'f:edh order:edhrec';

export interface SearchFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type: string;
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	legal?: string;
	colorIdentity?: ScryfallColor[];
	order?: ScryfallSortOrder;
	dir?: ScryfallSortDir;
}

interface UseScryfallCardSearchResult {
	cards: ScryfallCard[];
	isLoading: boolean;
	isLoadingMore: boolean;
	error: Error | null;
	queryError: { message: string; warnings: string[] } | null;
	hasMore: boolean;
	totalCards: number;
	suggestions: string[];
	loadMore: () => void;
	reset: () => void;
}

/**
 * @param options.enabled — when false, no request fires and in-flight requests are
 * aborted, but `cards`/`isLoading` keep their last values: callers must gate their
 * rendering on the same condition.
 */
export function useScryfallCardSearch(
	filters: SearchFilters,
	options: { enabled?: boolean } = {}
): UseScryfallCardSearchResult {
	const enabled = options.enabled ?? true;
	const [cards, setCards] = useState<ScryfallCard[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [queryError, setQueryError] = useState<{ message: string; warnings: string[] } | null>(
		null
	);
	const [hasMore, setHasMore] = useState(false);
	const [totalCards, setTotalCards] = useState(0);
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [page, setPage] = useState(1);

	const debouncedName = useDebounce(filters.name, 300);
	const lastSearchKeyRef = useRef<string>('');
	const abortControllerRef = useRef<AbortController | null>(null);

	const order = filters.order ?? 'name';
	const dir = filters.dir ?? 'auto';

	// Serialize array deps to strings so useCallback doesn't recreate on every render
	// when the parent passes a new array reference with the same content.
	const colorsKey = filters.colors.join(',');
	const raritiesKey = filters.rarities.join(',');
	const colorIdentityKey = (filters.colorIdentity ?? []).join(',');

	const buildQuery = useCallback(
		(name: string) => {
			const colors = colorsKey ? (colorsKey.split(',') as ScryfallColor[]) : undefined;
			const rarities = raritiesKey ? raritiesKey.split(',') : undefined;
			const colorIdentity = colorIdentityKey
				? (colorIdentityKey.split(',') as ScryfallColor[])
				: undefined;
			return buildScryfallQuery({
				name: name || undefined,
				colors,
				colorMatch: filters.colorMatch,
				type: filters.type || undefined,
				set: filters.set || undefined,
				rarities,
				text: filters.oracleText || undefined,
				cmc: filters.cmc || undefined,
				legal: filters.legal || undefined,
				colorIdentity,
			});
		},
		[
			colorsKey,
			filters.colorMatch,
			filters.type,
			filters.set,
			raritiesKey,
			filters.oracleText,
			filters.cmc,
			filters.legal,
			colorIdentityKey,
		]
	);

	const fetchCards = useCallback(
		// eslint-disable-next-line sonarjs/cognitive-complexity -- search state machine: handles abort, 404, 400, generic errors and pagination
		async (query: string, pageNum: number, isNewSearch: boolean) => {
			if (isNewSearch) {
				abortControllerRef.current?.abort();
				abortControllerRef.current = new AbortController();
			}
			const signal = abortControllerRef.current?.signal;

			const effectiveQuery = query.trim() || DEFAULT_QUERY;

			if (!effectiveQuery) {
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
				setQueryError(null);
				setSuggestions([]);

				const result = await searchCards({ q: effectiveQuery, page: pageNum, order, dir }, signal);

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
					setSuggestions(err.warnings ?? []);
					return;
				}
				if (err instanceof ScryfallApiError && err.status === 400) {
					setCards([]);
					setHasMore(false);
					setTotalCards(0);
					const isIgnoredTerms = err.details === 'All of your terms were ignored.';
					setQueryError({
						message: isIgnoredTerms
							? 'Your search term is too common to search as-is. Try a more specific term or use filters.'
							: err.details,
						warnings: err.warnings ?? [],
					});
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
		if (!enabled) {
			// Reset the key so re-enabling triggers a fresh search
			lastSearchKeyRef.current = '';
			abortControllerRef.current?.abort();
			return;
		}
		const query = buildQuery(debouncedName);
		const effectiveQuery = query.trim() || DEFAULT_QUERY;
		const searchKey = `${effectiveQuery}|${order}|${dir}`;

		if (searchKey !== lastSearchKeyRef.current) {
			lastSearchKeyRef.current = searchKey;
			setPage(1);
			fetchCards(query, 1, true);
		}
	}, [enabled, debouncedName, buildQuery, fetchCards, order, dir]);

	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	const lastQueryRef = useRef<string>('');

	const loadMore = useCallback(() => {
		if (!enabled) return;
		if (!isLoading && !isLoadingMore && hasMore) {
			const nextPage = page + 1;
			setPage(nextPage);
			// Extract only the query part from the search key for loadMore
			const query = lastSearchKeyRef.current.split('|')[0];
			lastQueryRef.current = query;
			fetchCards(query, nextPage, false);
		}
	}, [enabled, isLoading, isLoadingMore, hasMore, page, fetchCards]);

	const reset = useCallback(() => {
		setCards([]);
		setPage(1);
		setHasMore(false);
		setTotalCards(0);
		setError(null);
		setQueryError(null);
		setSuggestions([]);
		lastQueryRef.current = '';
	}, []);

	return {
		cards,
		isLoading,
		isLoadingMore,
		error,
		queryError,
		hasMore,
		totalCards,
		suggestions,
		loadMore,
		reset,
	};
}
