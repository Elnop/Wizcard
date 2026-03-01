'use client';

import { useState, useEffect } from 'react';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { getAllSets } from '@/lib/scryfall/endpoints/sets';

export function useSets() {
	const [sets, setSets] = useState<ScryfallSet[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function fetchSets() {
			try {
				setIsLoading(true);
				const result = await getAllSets();
				if (!cancelled) {
					const sortedSets = result.data
						.filter((set) => set.set_type !== 'token' && set.set_type !== 'memorabilia')
						.sort((a, b) => {
							const dateA = a.released_at ? new Date(a.released_at).getTime() : 0;
							const dateB = b.released_at ? new Date(b.released_at).getTime() : 0;
							return dateB - dateA;
						});
					setSets(sortedSets);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err : new Error('Failed to fetch sets'));
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		fetchSets();

		return () => {
			cancelled = true;
		};
	}, []);

	return { sets, isLoading, error };
}
