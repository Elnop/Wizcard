import type { Card } from '@/types/cards';

/**
 * Fisher-Yates : retourne une nouvelle liste mélangée uniformément.
 * Ne mute pas le tableau d'entrée.
 */
export function shuffle(cards: Card[]): Card[] {
	const out = cards.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
