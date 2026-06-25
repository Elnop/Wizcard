'use client';

import { useState, useEffect } from 'react';
import { queryCustomCards } from '@/lib/mpc/db/custom-cards';
import { toCustomCard } from '@/lib/mpc/adapter';
import type { CustomCard, MpcSource } from '@/lib/mpc/types';

interface UseCustomCardPrintsResult {
	prints: CustomCard[];
	loading: boolean;
}

export function useCustomCardPrints(
	oracleId: string | undefined,
	excludeId: string
): UseCustomCardPrintsResult {
	const [state, setState] = useState<UseCustomCardPrintsResult>({
		prints: [],
		loading: false,
	});

	useEffect(() => {
		if (!oracleId) {
			return;
		}

		let cancelled = false;

		const fetch = async () => {
			setState({ prints: [], loading: true });

			try {
				const result = await queryCustomCards({
					page: 1,
					pageSize: 100,
					filters: { oracleId },
				});

				if (cancelled) return;

				const unknownSource: MpcSource = {
					id: 'unknown',
					name: 'Custom',
					isBuiltIn: false,
					tags: [],
					driveFolderId: null,
				};

				const cards = result.cards
					.filter((c) => `mpc:${c.id}` !== excludeId && c.id !== excludeId)
					.map((c) => toCustomCard(c, unknownSource));

				setState({ prints: cards, loading: false });
			} catch {
				if (!cancelled) setState({ prints: [], loading: false });
			}
		};

		void fetch();
		return () => {
			cancelled = true;
		};
	}, [oracleId, excludeId]);

	return state;
}
