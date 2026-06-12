'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { queryCustomCards, getCustomCardSources } from '@/lib/supabase/custom-cards';
import { toCustomCard } from '../adapter';
import { useDebounce } from '@/lib/search/hooks/useDebounce';
import type { CustomCard } from '../types';
import type { CardFilters } from '@/lib/search/types';

export interface UseCustomCardsFilters extends CardFilters {
	mpcTagsMustHave: string[];
	mpcTagsMustNotHave: string[];
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
}

interface UseCustomCardsResult {
	cards: CustomCard[];
	isLoading: boolean;
	isLoadingMore: boolean;
	hasMore: boolean;
	total: number;
	error: string | null;
	loadMore: () => void;
}

const PAGE_SIZE = 48;

export function useCustomCards(
	sourceId: string | null | undefined,
	filters: UseCustomCardsFilters = {
		name: '',
		colors: [],
		colorMatch: 'include',
		type: '',
		set: '',
		rarities: [],
		oracleText: '',
		cmc: '',
		order: 'name',
		dir: 'asc',
		mpcTagsMustHave: [],
		mpcTagsMustNotHave: [],
	}
): UseCustomCardsResult {
	const [cards, setCards] = useState<CustomCard[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [total, setTotal] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);

	const abortRef = useRef<AbortController | null>(null);
	const lastFilterKeyRef = useRef<string>('');
	const sourcesRef = useRef<Awaited<ReturnType<typeof getCustomCardSources>> | null>(null);

	const debouncedName = useDebounce(filters.name, 300);
	const debouncedType = useDebounce(filters.type, 300);
	const debouncedOracleText = useDebounce(filters.oracleText, 300);
	const debouncedCmc = useDebounce(filters.cmc, 300);

	const colorsKey = filters.colors.join(',');
	const raritiesKey = filters.rarities.join(',');
	const mustHaveKey = filters.mpcTagsMustHave.join(',');
	const mustNotHaveKey = filters.mpcTagsMustNotHave.join(',');
	const oracleIdFilter = filters.oracleIdFilter ?? 'all';

	const filterKey = [
		sourceId ?? '__all__',
		debouncedName,
		colorsKey,
		filters.colorMatch,
		debouncedType,
		filters.set,
		raritiesKey,
		debouncedOracleText,
		debouncedCmc,
		filters.order,
		filters.dir,
		mustHaveKey,
		mustNotHaveKey,
		oracleIdFilter,
	].join('|');

	const fetchPage = useCallback(
		async (pageNum: number, isNewSearch: boolean) => {
			if (sourceId === undefined) return;

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			if (isNewSearch) setIsLoading(true);
			else setIsLoadingMore(true);
			setError(null);

			try {
				const [mpcCards, sources] = await Promise.all([
					queryCustomCards({
						sourceId: sourceId,
						page: pageNum,
						pageSize: PAGE_SIZE,
						filters: {
							name: debouncedName || undefined,
							colors: colorsKey ? colorsKey.split(',') : undefined,
							colorMatch: filters.colorMatch,
							type: debouncedType || undefined,
							set: filters.set || undefined,
							cmc: debouncedCmc || undefined,
							rarities: raritiesKey ? raritiesKey.split(',') : undefined,
							oracleText: debouncedOracleText || undefined,
							mpcTagsMustHave: mustHaveKey ? mustHaveKey.split(',') : undefined,
							mpcTagsMustNotHave: mustNotHaveKey ? mustNotHaveKey.split(',') : undefined,
							oracleIdFilter: oracleIdFilter !== 'all' ? oracleIdFilter : undefined,
							order: filters.order,
							dir: filters.dir,
						},
					}),
					sourcesRef.current ? Promise.resolve(sourcesRef.current) : getCustomCardSources(),
				]);

				if (controller.signal.aborted) return;

				sourcesRef.current = sources;
				const sourceMap = new Map(sources.map((s) => [s.id, s]));
				const converted = mpcCards.cards.map((card) => {
					const source = (card.sourceId ? sourceMap.get(card.sourceId) : undefined) ?? {
						id: card.sourceId ?? 'user',
						name: card.sourceId ?? 'My Cards',
						isBuiltIn: false,
						tags: [],
					};
					return toCustomCard(card, source);
				});

				if (isNewSearch) {
					setCards(converted);
				} else {
					setCards((prev) => [...prev, ...converted]);
				}
				setHasMore(mpcCards.hasMore);
				setTotal(mpcCards.total);
			} catch (err) {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err.message : 'Unknown error');
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
					setIsLoadingMore(false);
				}
			}
		},
		[
			sourceId,
			debouncedName,
			colorsKey,
			filters.colorMatch,
			debouncedType,
			filters.set,
			raritiesKey,
			debouncedOracleText,
			debouncedCmc,
			filters.order,
			filters.dir,
			mustHaveKey,
			mustNotHaveKey,
			oracleIdFilter,
		]
	);

	useEffect(() => {
		if (sourceId === undefined) {
			setCards([]);
			setHasMore(false);
			setTotal(0);
			setError(null);
			return;
		}
		if (filterKey !== lastFilterKeyRef.current) {
			lastFilterKeyRef.current = filterKey;
			setPage(1);
			fetchPage(1, true);
		}
	}, [filterKey, sourceId, fetchPage]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	const loadMore = useCallback(() => {
		if (!isLoading && !isLoadingMore && hasMore) {
			const next = page + 1;
			setPage(next);
			fetchPage(next, false);
		}
	}, [isLoading, isLoadingMore, hasMore, page, fetchPage]);

	return { cards, isLoading, isLoadingMore, hasMore, total, error, loadMore };
}
