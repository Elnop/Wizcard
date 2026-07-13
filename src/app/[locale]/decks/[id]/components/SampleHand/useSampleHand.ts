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
	// Adjust state during render (React-documented pattern) instead of an effect,
	// to stay lint-clean and avoid an extra render pass.
	const [prevMainboard, setPrevMainboard] = useState(mainboard);
	if (prevMainboard !== mainboard) {
		setPrevMainboard(mainboard);
		setState({ shuffled: null, handSize: INITIAL_HAND_SIZE });
	}

	const deal = useCallback(() => {
		setState({
			shuffled: shuffle(mainboard),
			handSize: Math.min(INITIAL_HAND_SIZE, mainboard.length),
		});
	}, [mainboard]);

	// Tirage automatique après hydratation. DOIT vivre dans un effect (client
	// only) : appeler shuffle() au render s'exécuterait aussi côté serveur et
	// produirait un ordre différent du client → hydration mismatch avec
	// Math.random. Le pattern « adjust state during render » ne convient donc PAS
	// ici. Pas de boucle : la garde `shuffled === null` devient fausse après le
	// setState, donc l'effet ne se re-déclenche pas (il ne re-tire qu'après un
	// reset — deck édité — qui remet shuffled à null).
	useEffect(() => {
		if (state.shuffled !== null || mainboard.length === 0) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- client-only initial deal; render-time alternative would break SSR hydration
		setState({
			shuffled: shuffle(mainboard),
			handSize: Math.min(INITIAL_HAND_SIZE, mainboard.length),
		});
	}, [state.shuffled, mainboard]);

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
