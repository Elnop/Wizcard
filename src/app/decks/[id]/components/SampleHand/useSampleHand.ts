import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@/types/cards';
import { shuffle } from '@/lib/deck/utils/sample-hand';

const INITIAL_HAND_SIZE = 7;

export interface SampleHandState {
	hand: Card[];
	hasHand: boolean;
	canDraw: boolean;
	deal: () => void;
	mulligan: () => void;
	draw: () => void;
}

export function useSampleHand(mainboard: Card[]): SampleHandState {
	const [state, setState] = useState<{ shuffled: Card[] | null; handSize: number }>({
		shuffled: null,
		handSize: INITIAL_HAND_SIZE,
	});

	// Deck édité (mainboard change d'identité) → réinitialiser la main.
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setState({ shuffled: null, handSize: INITIAL_HAND_SIZE });
	}, [mainboard]);

	const deal = useCallback(() => {
		setState({
			shuffled: shuffle(mainboard),
			handSize: Math.min(INITIAL_HAND_SIZE, mainboard.length),
		});
	}, [mainboard]);

	const draw = useCallback(() => {
		setState((prev) => ({
			...prev,
			handSize: Math.min(prev.handSize + 1, mainboard.length),
		}));
	}, [mainboard.length]);

	const hasHand = state.shuffled !== null;
	const hand = state.shuffled ? state.shuffled.slice(0, state.handSize) : [];
	const canDraw = state.shuffled !== null && state.handSize < mainboard.length;

	return { hand, hasHand, canDraw, deal, mulligan: deal, draw };
}
