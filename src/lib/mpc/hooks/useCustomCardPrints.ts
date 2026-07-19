'use client';

import { useState, useEffect } from 'react';
import { queryCustomCards } from '@/lib/mpc/db/custom-cards';
import { toCustomCard } from '@/lib/mpc/adapter';
import type { CustomCard, MpcSource } from '@/lib/mpc/types';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { getEffectiveIgnoredTags, isIgnored } from '@/lib/mpc/ignored-tags';

interface UseCustomCardPrintsResult {
	prints: CustomCard[];
	loading: boolean;
}

export function useCustomCardPrints(oracleId: string | undefined): UseCustomCardPrintsResult {
	const [state, setState] = useState<UseCustomCardPrintsResult>({
		prints: [],
		loading: false,
	});

	const { profile } = useProfileContext();
	const ignoredTags = getEffectiveIgnoredTags(profile);
	const ignoredKey = ignoredTags.join(',');

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

				// The current print is kept in the list — the caller marks it as
				// "selected"/"shown" (see PrintList.isCurrentPrint / PrintsTab). A custom
				// current print lives only in this section, so excluding it here would
				// make it vanish entirely from the picker and the card page.
				const cards = result.cards
					.map((c) => toCustomCard(c, unknownSource))
					.filter((c) => !isIgnored(c, ignoredTags));

				setState({ prints: cards, loading: false });
			} catch {
				if (!cancelled) setState({ prints: [], loading: false });
			}
		};

		void fetch();
		return () => {
			cancelled = true;
		};
	}, [oracleId, ignoredKey]); // eslint-disable-line react-hooks/exhaustive-deps

	return state;
}
