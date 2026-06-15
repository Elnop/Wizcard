import type { ScryfallRelatedCard } from '@/lib/scryfall/types/scryfall';

/** Minimal shape needed to extract token parts — satisfied by both Scryfall and custom cards. */
interface CardWithParts {
	id: string;
	all_parts?: ScryfallRelatedCard[];
}

/**
 * Collect the unique Scryfall print IDs of the tokens produced by the given cards.
 *
 * Each card's `all_parts` lists related cards (including the card itself). We keep
 * only parts with `component === 'token'` and drop the card's own id, then dedupe
 * across all source cards.
 */
export function collectDeckTokenIds(cards: CardWithParts[]): string[] {
	const tokenIds = new Set<string>();
	for (const card of cards) {
		for (const part of card.all_parts ?? []) {
			if (part.component === 'token' && part.id !== card.id) {
				tokenIds.add(part.id);
			}
		}
	}
	return [...tokenIds];
}

/**
 * True when `card` produces the given token. Matched by token name because
 * `all_parts` entries expose only `id`/`name`/`type_line` (no `oracle_id`), and a
 * token name is stable across prints.
 */
export function cardProducesToken(card: CardWithParts, token: { name: string }): boolean {
	return (card.all_parts ?? []).some(
		(part) => part.component === 'token' && part.id !== card.id && part.name === token.name
	);
}
