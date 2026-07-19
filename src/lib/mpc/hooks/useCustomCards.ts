'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { queryCustomCards, getCustomCardSources } from '@/lib/mpc/db/custom-cards';
import { toCustomCard } from '../adapter';
import { getEffectiveIgnoredTags, isIgnored } from '@/lib/mpc/ignored-tags';
import { useProfileStore } from '@/lib/profile/store/profile-store';
import { useDebounce } from '@/lib/search/hooks/useDebounce';
import type { CustomCard, CardType, MpcCard, MpcSource } from '../types';
import type { CardFilters } from '@/lib/search/types';

export interface UseCustomCardsFilters extends CardFilters {
	mpcTagsMustHave: string[];
	mpcTagsMustNotHave: string[];
	cardTypes?: CardType[];
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

/** Split the stable ignored-tags key back into an array (empty key → []). */
function splitIgnoredKey(key: string): string[] {
	return key ? key.split(',') : [];
}

/**
 * Convert raw MPC cards to display CustomCards, resolving each card's source and
 * dropping any card carrying an ignored tag (safety net over the DB filter — an
 * ignored card must never surface in a list).
 */
function toDisplayCards(
	cards: MpcCard[],
	sources: MpcSource[],
	ignoredTags: string[]
): CustomCard[] {
	const sourceMap = new Map(sources.map((s) => [s.id, s]));
	const result: CustomCard[] = [];
	for (const card of cards) {
		const source = (card.sourceId ? sourceMap.get(card.sourceId) : undefined) ?? {
			id: card.sourceId ?? 'user',
			name: card.sourceId ?? 'My Cards',
			isBuiltIn: false,
			tags: [],
		};
		const converted = toCustomCard(card, source);
		if (!isIgnored(converted, ignoredTags)) result.push(converted);
	}
	return result;
}

export function useCustomCards(
	sourceId: string | null | undefined,
	filters: UseCustomCardsFilters = {
		name: '',
		colors: [],
		colorMatch: 'include',
		colorIdentity: [],
		colorIdentityMatch: 'atMost',
		type: [],
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
	// Debounce the joined key (stable string) rather than the array reference.
	const debouncedType = useDebounce(filters.type.join(','), 300);
	const debouncedOracleText = useDebounce(filters.oracleText, 300);
	const debouncedCmc = useDebounce(filters.cmc, 300);

	// Profile-level ignored tags (Ignored Tags setting). Guest → ['nsfw']. Keyed as
	// a stable string so effects/callbacks re-run when the setting changes.
	const profile = useProfileStore((s) => s.profile);
	const ignoredTags = getEffectiveIgnoredTags(profile);
	const ignoredKey = ignoredTags.join(',');

	const colorsKey = filters.colors.join(',');
	const raritiesKey = filters.rarities.join(',');
	const mustHaveKey = filters.mpcTagsMustHave.join(',');
	const mustNotHaveKey = filters.mpcTagsMustNotHave.join(',');
	const cardTypesKey = (filters.cardTypes ?? []).join(',');

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
		cardTypesKey,
		ignoredKey,
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

			// Derived from the stable key so the callback depends only on `ignoredKey`.
			const ignoredTagsForQuery = splitIgnoredKey(ignoredKey);

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
							type: debouncedType ? debouncedType.split(',') : undefined,
							set: filters.set || undefined,
							cmc: debouncedCmc || undefined,
							rarities: raritiesKey ? raritiesKey.split(',') : undefined,
							oracleText: debouncedOracleText || undefined,
							mpcTagsMustHave: mustHaveKey ? mustHaveKey.split(',') : undefined,
							mpcTagsMustNotHave: mustNotHaveKey ? mustNotHaveKey.split(',') : undefined,
							ignoredTags: ignoredTagsForQuery.length ? ignoredTagsForQuery : undefined,
							cardTypes: cardTypesKey ? (cardTypesKey.split(',') as CardType[]) : undefined,
							order: filters.order,
							dir: filters.dir,
						},
					}),
					sourcesRef.current ? Promise.resolve(sourcesRef.current) : getCustomCardSources(),
				]);

				if (controller.signal.aborted) return;

				sourcesRef.current = sources;
				const converted = toDisplayCards(mpcCards.cards, sources, ignoredTagsForQuery);

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
			cardTypesKey,
			ignoredKey,
		]
	);

	useEffect(() => {
		if (sourceId === undefined) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- resets to empty when source becomes undefined; pre-existing, unrelated to this task's changes
			setCards([]);
			setHasMore(false);
			setTotal(0);
			setError(null);
			lastFilterKeyRef.current = '';
			return;
		}
		if (filterKey !== lastFilterKeyRef.current) {
			lastFilterKeyRef.current = filterKey;
			setPage(1);
			setIsLoading(true);
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
