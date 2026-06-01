'use client';

import { useState, useEffect } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { toSyntheticScryfallCard } from '../adapter';
import type { MpcIndexEntry } from '../types';

interface UseMpcPrintsResult {
	prints: ScryfallCard[];
	loading: boolean;
	error: string | null;
}

export function useMpcPrints(cardName: string): UseMpcPrintsResult {
	const [state, setState] = useState<{
		prints: ScryfallCard[];
		loading: boolean;
		error: string | null;
	}>({
		prints: [],
		loading: false,
		error: null,
	});

	useEffect(() => {
		if (!cardName) {
			setState({ prints: [], loading: false, error: null });
			return;
		}

		setState({ prints: [], loading: true, error: null });

		let cancelled = false;

		const fetchPrints = async () => {
			try {
				const res = await fetch(`/api/mpc/index?name=${encodeURIComponent(cardName)}`);
				if (!res.ok) throw new Error(`MPC index fetch failed: ${res.status}`);
				const entries = (await res.json()) as MpcIndexEntry[];

				if (cancelled) return;

				const synthetic = entries.map((entry) =>
					toSyntheticScryfallCard(
						{
							id: entry.identifier,
							name: entry.name,
							sourceId: entry.sourceKey,
							imageUrl: entry.mediumThumbnailUrl,
							isCustom: true,
						},
						{
							id: entry.sourceKey,
							name: entry.sourceName,
							isBuiltIn: true,
							tags: ['mpcfill', entry.sourceKey],
						}
					)
				);
				setState({ prints: synthetic, loading: false, error: null });
			} catch (err: unknown) {
				if (cancelled) return;
				setState({
					prints: [],
					loading: false,
					error: err instanceof Error ? err.message : 'Unknown error',
				});
			}
		};

		fetchPrints();

		return () => {
			cancelled = true;
		};
	}, [cardName]);

	return state;
}
