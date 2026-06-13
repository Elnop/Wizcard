'use client';

import { useState, useEffect } from 'react';
import { toCustomCard } from '../adapter';
import type { CustomCard, MpcIndexEntry } from '../types';

interface UseMpcPrintsResult {
	prints: CustomCard[];
	loading: boolean;
	error: string | null;
}

export function useMpcPrints(cardName: string): UseMpcPrintsResult {
	const [state, setState] = useState<UseMpcPrintsResult>({
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

				const cards = entries.map((entry) =>
					toCustomCard(
						{
							id: entry.identifier,
							name: entry.name,
							rawName: entry.rawName,
							displayName: null,
							sourceId: entry.sourceKey,
							imageUrl: entry.mediumThumbnailUrl,
							isCustom: true,
							sourceType: 'mpc_ingested',
							isPublic: true,
							cardType: 'card',
							language: null,
							tags: entry.tags,
							setCode: null,
							collectorNumber: null,
							driveFolderPath: null,
						},
						{
							id: entry.sourceKey,
							name: entry.sourceName,
							isBuiltIn: true,
							tags: ['mpcfill', entry.sourceKey],
						}
					)
				);
				setState({ prints: cards, loading: false, error: null });
			} catch (err: unknown) {
				if (cancelled) return;
				setState({
					prints: [],
					loading: false,
					error: err instanceof Error ? err.message : 'Unknown error',
				});
			}
		};

		void fetchPrints();

		return () => {
			cancelled = true;
		};
	}, [cardName]);

	return state;
}
