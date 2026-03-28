'use client';

import { useState, useEffect } from 'react';
import type { ScryfallCard } from '../types/scryfall';
import { getCardPrints } from '../endpoints/cards';

export function useCardPrints(prints_search_uri: string | undefined): {
	prints: ScryfallCard[];
	loading: boolean;
	error: string | null;
} {
	const [prints, setPrints] = useState<ScryfallCard[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!prints_search_uri) return;

		const controller = new AbortController();

		const fetchPrints = async () => {
			try {
				setLoading(true);
				setError(null);
				const data = await getCardPrints(prints_search_uri, controller.signal);
				if (!controller.signal.aborted) {
					setPrints(data);
				}
			} catch (err: unknown) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				if (!controller.signal.aborted) {
					setError(err instanceof Error ? err.message : 'Failed to load prints');
					setPrints([]);
				}
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		};

		fetchPrints();

		return () => {
			controller.abort();
		};
	}, [prints_search_uri]);

	return { prints, loading, error };
}
