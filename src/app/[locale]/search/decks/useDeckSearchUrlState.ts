'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { DEFAULT_DECK_FILTERS } from '@/lib/search/types';
import type { DeckSearchFilters, PreconFilter } from '@/lib/search/types';

const VALID_PRECON_FILTERS = new Set(['all', 'only', 'exclude']);

function parsePreconFilter(param: string | null): PreconFilter {
	if (param && VALID_PRECON_FILTERS.has(param)) return param as PreconFilter;
	return 'all';
}

/** Sérialise les filtres decks en query string. Les paramètres n'ont plus le
 * préfixe `d` : la route dédiée écarte toute collision avec ceux des cartes. */
function buildDeckParams(filters: DeckSearchFilters): URLSearchParams {
	const params = new URLSearchParams();
	if (filters.name) params.set('name', filters.name);
	if (filters.formats.length > 0) params.set('formats', filters.formats.join(','));
	if (filters.authorNickname) params.set('author', filters.authorNickname);
	if (filters.cardInBoard) params.set('card', filters.cardInBoard);
	if (filters.commander) params.set('commander', filters.commander);
	if (filters.precon !== 'all') params.set('precon', filters.precon);
	return params;
}

export function useDeckSearchUrlState() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [filters, setFilters] = useState<DeckSearchFilters>(() => ({
		name: searchParams.get('name') ?? DEFAULT_DECK_FILTERS.name,
		formats: (searchParams.get('formats')?.split(',').filter(Boolean) ??
			DEFAULT_DECK_FILTERS.formats) as DeckSearchFilters['formats'],
		authorNickname: searchParams.get('author') ?? DEFAULT_DECK_FILTERS.authorNickname,
		cardInBoard: searchParams.get('card') ?? DEFAULT_DECK_FILTERS.cardInBoard,
		commander: searchParams.get('commander') ?? DEFAULT_DECK_FILTERS.commander,
		precon: parsePreconFilter(searchParams.get('precon')),
	}));

	// Sans ce garde, le premier rendu réécrirait l'URL et écraserait les
	// paramètres entrants d'un lien partagé.
	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const queryString = buildDeckParams(filters).toString();
		router.replace(queryString ? `/search/decks?${queryString}` : '/search/decks', {
			scroll: false,
		});
	}, [filters, router]);

	return { filters, setFilters };
}
