'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import { collectDeckTokenIds } from '@/lib/deck/utils/collectDeckTokens';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';

/**
 * Resolve the tokens produced by a single card from its Scryfall `all_parts`.
 *
 * `hasTokens` is derived synchronously from `all_parts` (no network), so callers
 * can decide whether to show a tokens UI before the resolution completes. When the
 * card produces no tokens, no network request is made.
 */
export function useCardTokens(card: ScryfallCard | CustomCard | null): {
	tokens: ScryfallCard[];
	loading: boolean;
	hasTokens: boolean;
} {
	const tokenIds = useMemo(() => (card ? collectDeckTokenIds([card]) : []), [card]);
	const tokenKey = tokenIds.join(',');

	// Keep resolved tokens tagged with the key they belong to. When `tokenKey`
	// changes, the previous result no longer matches and we render an empty/loading
	// state without a synchronous setState in the effect.
	const [resolved, setResolved] = useState<{ key: string; tokens: ScryfallCard[] } | null>(null);

	useEffect(() => {
		if (tokenIds.length === 0) return;

		let cancelled = false;
		resolveCardsByScryfallIds(tokenIds)
			.then((resolvedMap) => {
				if (cancelled) return;
				setResolved({
					key: tokenKey,
					tokens: tokenIds
						.map((id) => resolvedMap.get(id))
						.filter((c): c is ScryfallCard => Boolean(c)),
				});
			})
			.catch(() => {
				if (!cancelled) setResolved({ key: tokenKey, tokens: [] });
			});

		return () => {
			cancelled = true;
		};
	}, [tokenIds, tokenKey]);

	const isResolved = resolved?.key === tokenKey;
	const tokens = isResolved ? resolved.tokens : [];
	const loading = tokenIds.length > 0 && !isResolved;

	return { tokens, loading, hasTokens: tokenIds.length > 0 };
}
