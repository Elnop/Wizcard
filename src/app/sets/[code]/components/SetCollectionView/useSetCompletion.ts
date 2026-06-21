'use client';

import { useMemo } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { computeSetCompletion, type SetCompletion } from '../../utils/setCompletion';
import { useSetCardsComplete } from './useSetCardsComplete';

export interface UseSetCompletionResult {
	/** All cards (every print) of the set, once loaded. */
	cards: ReturnType<typeof useSetCardsComplete>['cards'];
	completion: SetCompletion;
	isLoading: boolean;
	error: Error | null;
	/** True when the user's collection is not fully hydrated (completion may be understated). */
	isPartialCollection: boolean;
}

/**
 * Fetches every print of a set and cross-references it with the user's collection
 * to produce completion stats. Always enabled so the header rings are available
 * as soon as the page opens.
 */
export function useSetCompletion(setCode: string): UseSetCompletionResult {
	const { getOwnership, isFullyLoaded } = useCollectionContext();
	const { cards, isLoading, error } = useSetCardsComplete(setCode, true);

	const completion = useMemo(
		() => computeSetCompletion(cards, getOwnership),
		[cards, getOwnership]
	);

	return {
		cards,
		completion,
		isLoading,
		error,
		isPartialCollection: !isFullyLoaded,
	};
}
