'use client';

import { useCallback, useEffect } from 'react';
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';
import { normalizeImportResult } from '@/lib/import/utils/normalize-set-code';
import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { ParsedImportRow } from '@/lib/import/types';

type Normalizable = {
	rows: ParsedImportRow[];
	identifiers: ScryfallCardIdentifier[];
};

/**
 * Hook that exposes a function to normalize MTGA/MTGO set codes to Scryfall
 * canonical codes using the cached set list from the Scryfall store.
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

	return normalize;
}
