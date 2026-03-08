'use client';

import { useState, useCallback, useEffect } from 'react';
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

	const fetchPrints = useCallback(async (uri: string) => {
		try {
			setLoading(true);
			setError(null);
			const data = await getCardPrints(uri);
			setPrints(data);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to load prints');
			setPrints([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!prints_search_uri) return;
		fetchPrints(prints_search_uri);
	}, [prints_search_uri, fetchPrints]);

	return { prints, loading, error };
}
