'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Card } from '@/types/cards';
import { type CustomCard, isCustomCard } from '@/lib/mpc/types';
import {
	collectDeckTokenIds,
	collectDeckTokensWithSourceLang,
} from '@/lib/deck/utils/collectDeckTokens';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { localizeTokens } from '@/lib/scryfall/localizeTokens';
import { hydrateCardsAllParts } from '@/lib/scryfall/hydrateAllParts';

/**
 * Resolve the tokens produced by a single card from its Scryfall `all_parts`.
 *
 * Localized (non-English) prints omit `all_parts`, so the card is first hydrated
 * on demand (fetching the English oracle print) before tokens are derived. Until
 * that hydration resolves we use the card as-is; an English card already carries
 * `all_parts`, so its tokens are derived with no extra network round-trip.
 */
export function useCardTokens(card: Card | CustomCard | null): {
	tokens: Card[];
	loading: boolean;
	hasTokens: boolean;
} {
	// Hold the hydrated all_parts for the current card, tagged by the card's id so a
	// stale result is ignored when `card` changes (no synchronous reset in an effect).
	const [hydration, setHydration] = useState<{ id: string; card: Card } | null>(null);

	useEffect(() => {
		if (!card || !isOfficialCard(card)) return;

		let cancelled = false;
		void hydrateCardsAllParts([card]).then(([hydrated]) => {
			if (!cancelled && hydrated !== card) setHydration({ id: card.id, card: hydrated });
		});
		return () => {
			cancelled = true;
		};
	}, [card]);

	// Derive tokens from the hydrated card when it matches the current card, else the
	// card as-is (English cards need no hydration; localized ones fill in once ready).
	const effectiveCard =
		card && isOfficialCard(card) && hydration?.id === card.id ? hydration.card : card;

	const tokenIds = useMemo(
		() => (effectiveCard ? collectDeckTokenIds([effectiveCard]) : []),
		[effectiveCard]
	);
	const tokenKey = tokenIds.join(',');

	const langByTokenId = useMemo(
		() =>
			effectiveCard ? collectDeckTokensWithSourceLang([effectiveCard]) : new Map<string, string>(),
		[effectiveCard]
	);

	// Keep resolved tokens tagged with the key they belong to. When `tokenKey`
	// changes, the previous result no longer matches and we render an empty/loading
	// state without a synchronous setState in the effect.
	const [resolved, setResolved] = useState<{ key: string; tokens: Card[] } | null>(null);

	useEffect(() => {
		if (tokenIds.length === 0) return;

		let cancelled = false;
		resolveCardsByScryfallIds(tokenIds)
			.then(async (resolvedMap) => {
				if (cancelled) return;
				// Tokens are always real prints, never MPC custom cards — drop any custom the
				// resolver returned so the localized result is a clean domain `Card[]`.
				const enTokens = tokenIds
					.map((id) => resolvedMap.get(id))
					.filter((c): c is Card => Boolean(c) && !isCustomCard(c!));
				const localized: Card[] = await localizeTokens(enTokens, langByTokenId);
				if (cancelled) return;
				setResolved({ key: tokenKey, tokens: localized });
			})
			.catch(() => {
				if (!cancelled) setResolved({ key: tokenKey, tokens: [] });
			});

		return () => {
			cancelled = true;
		};
	}, [tokenIds, tokenKey, langByTokenId]);

	const isResolved = resolved?.key === tokenKey;
	const tokens = isResolved ? resolved.tokens : [];
	const loading = tokenIds.length > 0 && !isResolved;

	return { tokens, loading, hasTokens: tokenIds.length > 0 };
}

/** True for official prints (which carry `lang`/`oracle_id`), false for custom cards. */
function isOfficialCard(card: Card | CustomCard): card is Card {
	return 'oracle_id' in card && typeof (card as Card).lang === 'string';
}
