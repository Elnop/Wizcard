'use client';

import { useEffect, useReducer } from 'react';
import {
	getCustomCards,
	getAllCustomCards,
	getCustomCardSources,
} from '@/lib/supabase/custom-cards';
import { toSyntheticScryfallCard } from '../adapter';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

interface State {
	cards: ScryfallCard[];
	isLoading: boolean;
	error: string | null;
}

type Action =
	| { type: 'loading' }
	| { type: 'success'; cards: ScryfallCard[] }
	| { type: 'error'; message: string };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'loading':
			return { cards: [], isLoading: true, error: null };
		case 'success':
			return { cards: action.cards, isLoading: false, error: null };
		case 'error':
			return { cards: [], isLoading: false, error: action.message };
		default:
			return state;
	}
}

export function useCustomCards(sourceId?: string | null) {
	const [state, dispatch] = useReducer(reducer, {
		cards: [],
		isLoading: false,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;

		async function load() {
			dispatch({ type: 'loading' });
			try {
				const [mpcCards, sources] = await Promise.all([
					sourceId ? getCustomCards(sourceId) : getAllCustomCards(),
					getCustomCardSources(),
				]);
				if (cancelled) return;
				const sourceMap = new Map(sources.map((s) => [s.id, s]));
				const converted = mpcCards.map((card) => {
					const source = sourceMap.get(card.sourceId) ?? {
						id: card.sourceId,
						name: card.sourceId,
						isBuiltIn: true,
						tags: [],
					};
					return toSyntheticScryfallCard(card, source);
				});
				dispatch({ type: 'success', cards: converted });
			} catch (err: unknown) {
				if (!cancelled) {
					dispatch({
						type: 'error',
						message: err instanceof Error ? err.message : 'Unknown error',
					});
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [sourceId]);

	return state;
}
