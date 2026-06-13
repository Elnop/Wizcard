'use client';

import { useCallback, useEffect } from 'react';
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';
import {
	normalizeImportResult,
	normalizePendingCards,
} from '@/lib/import/utils/normalize-set-code';
import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { PendingCard } from '@/lib/import/types';

type Normalizable = {
	rows: Array<{ set: string }>;
	identifiers: ScryfallCardIdentifier[];
};

/**
 * Hook that exposes set code normalization functions using the cached set list.
 * - normalize: for DeckImportResult (rows + identifiers) — used by ImportDeckModal
 * - normalizePending: for PendingCard[] — used by collection import pipeline
 */
export function useSetCodeNormalizer() {
	const sets = useScryfallStore((s) => s.sets);
	const fetchSets = useScryfallStore((s) => s.fetchSets);

	useEffect(() => {
		if (sets.length === 0) {
			void fetchSets();
		}
	}, [sets.length, fetchSets]);

	const normalize = useCallback(
		<T extends Normalizable>(parsed: T): T => {
			if (sets.length === 0) return parsed;
			return normalizeImportResult(parsed, sets);
		},
		[sets]
	);

	const normalizePending = useCallback(
		(cards: PendingCard[]): PendingCard[] => {
			if (sets.length === 0) return cards;
			return normalizePendingCards(cards, sets);
		},
		[sets]
	);

	return { normalize, normalizePending };
}
