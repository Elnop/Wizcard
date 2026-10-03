'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCardsStore, getCard } from '@/lib/scryfall/store/cards-store';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { PAGE_SIZE } from '@/lib/collection/constants';
import type { Card, CardStack, FacetStack } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';
import { rangeReady, toCardStack, windowIds } from '../page-window';

export interface PagedCards {
	visibleStacks: CardStack[];
	hasMore: boolean;
	loadMore: () => void;
	isLoadingMore: boolean;
	isFirstPageLoading: boolean;
	error: Error | null;
	retry: () => void;
}

/**
 * Full cards only for what is shown: the visible stacks + one page ahead. The next
 * page is revealed in one block — `loadMore` waits (spinner) until all of its
 * stacks are resolved. `resetKey` change (filters/sort) → back to page 1.
 */
export function usePagedCards(stacks: FacetStack[], resetKey: string): PagedCards {
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [wantMore, setWantMore] = useState(false);
	const [trackedKey, setTrackedKey] = useState(resetKey);
	const [attempt, setAttempt] = useState(0);
	const [error, setError] = useState<Error | null>(null);
	// Ids requested and NOT returned for 2 consecutive resolver runs are excluded:
	// one unresolvable print must not block scrolling forever. `excludedRef` mirrors
	// `excludedIds` for synchronous reads inside the resolver effect; `failCounts`
	// is write-only state the effect owns (never read in render).
	const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(() => new Set());
	const excludedRef = useRef<ReadonlySet<string>>(excludedIds);
	const failCountsRef = useRef<Map<string, number>>(new Map());

	if (trackedKey !== resetKey) {
		setTrackedKey(resetKey);
		setVisibleCount(PAGE_SIZE);
		setWantMore(false);
		setError(null);
	}

	const ids = useMemo(() => windowIds(stacks, visibleCount + PAGE_SIZE), [stacks, visibleCount]);
	const idsKey = useMemo(() => ids.join(','), [ids]);

	// Same scoped-selector pattern as useCollectionCards: re-render only when a card
	// of THIS window lands in the global store.
	const cards = useCardsStore(
		useShallow((s) => {
			const m = new Map<string, Card | CustomCard>();
			for (const id of ids) {
				const c = s.cards.get(id);
				if (c) m.set(id, c);
			}
			return m;
		})
	);

	useEffect(() => {
		const missing = idsKey
			? idsKey.split(',').filter((id) => !getCard(id) && !excludedRef.current.has(id))
			: [];
		if (missing.length === 0) return;
		const cancelled = { current: false };
		resolveCardsByScryfallIds(missing, { isCancelled: () => cancelled.current })
			.then((resolved) => {
				if (cancelled.current) return;
				for (const id of resolved.keys()) failCountsRef.current.delete(id);
				const stillMissing = missing.filter((id) => !resolved.has(id));
				const newlyExcluded: string[] = [];
				for (const id of stillMissing) {
					const count = (failCountsRef.current.get(id) ?? 0) + 1;
					failCountsRef.current.set(id, count);
					if (count >= 2) newlyExcluded.push(id);
				}
				if (newlyExcluded.length > 0) {
					console.warn(
						`[usePagedCards] excluding ${newlyExcluded.length} unresolvable card(s):`,
						newlyExcluded
					);
					const next = new Set(excludedRef.current);
					for (const id of newlyExcluded) next.add(id);
					excludedRef.current = next;
					setExcludedIds(next);
				}
				const stillFailing = stillMissing.filter((id) => (failCountsRef.current.get(id) ?? 0) < 2);
				setError(
					stillFailing.length > 0
						? new Error(`${stillFailing.length} cards could not be loaded`)
						: null
				);
			})
			.catch((err) => {
				if (!cancelled.current) setError(err instanceof Error ? err : new Error(String(err)));
			});
		return () => {
			cancelled.current = true;
		};
	}, [idsKey, attempt]);

	const nextReady = rangeReady(stacks, visibleCount, visibleCount + PAGE_SIZE, cards, excludedIds);
	// Render-time reveal of a requested page once it is complete.
	if (wantMore && nextReady && visibleCount < stacks.length) {
		setVisibleCount(visibleCount + PAGE_SIZE);
		setWantMore(false);
	}

	const visibleStacks = useMemo(
		() =>
			stacks
				.slice(0, visibleCount)
				.map((s) => toCardStack(s, cards, excludedIds))
				.filter((s): s is CardStack => s !== null),
		[stacks, visibleCount, cards, excludedIds]
	);

	const firstEnd = Math.min(PAGE_SIZE, stacks.length);
	return {
		visibleStacks,
		hasMore: visibleCount < stacks.length,
		loadMore: () => {
			if (nextReady) setVisibleCount((v) => v + PAGE_SIZE);
			else setWantMore(true);
		},
		isLoadingMore: wantMore,
		isFirstPageLoading: !rangeReady(stacks, 0, firstEnd, cards, excludedIds) && error === null,
		error,
		retry: () => {
			setError(null);
			setAttempt((a) => a + 1);
		},
	};
}
