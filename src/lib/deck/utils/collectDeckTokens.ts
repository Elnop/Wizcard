import type { ScryfallRelatedCard } from '@/lib/scryfall/types/scryfall';

/** Minimal shape needed to extract token parts — satisfied by both Scryfall and custom cards. */
interface CardWithParts {
	id: string;
	all_parts?: ScryfallRelatedCard[];
}

/**
 * True when a related part is something the card *produces* (a token or an emblem),
 * as opposed to the card's own face, a meld part, or a set checklist.
 *
 * Scryfall marks actual tokens with `component === 'token'`, but emblems are listed
 * as `component === 'combo_piece'` with an `Emblem` type line (e.g. Lolth, Spider
 * Queen produces both a Spider token and an emblem). We therefore include emblems
 * explicitly. The `id !== card.id` guard drops the card's own entry; it isn't enough
 * on its own, since the planeswalker face is a separate print (different id), so the
 * type-based filter is what keeps non-emblem `combo_piece` entries out.
 */
function isProducedToken(part: ScryfallRelatedCard, sourceId: string): boolean {
	if (part.id === sourceId) return false;
	if (part.component === 'token') return true;
	if (part.component === 'combo_piece' && /\bEmblem\b/.test(part.type_line)) return true;
	return false;
}

/**
 * Collect the unique Scryfall print IDs of the tokens and emblems produced by the
 * given cards, deduped across all source cards.
 */
export function collectDeckTokenIds(cards: CardWithParts[]): string[] {
	const tokenIds = new Set<string>();
	for (const card of cards) {
		for (const part of card.all_parts ?? []) {
			if (isProducedToken(part, card.id)) {
				tokenIds.add(part.id);
			}
		}
	}
	return [...tokenIds];
}

/**
 * True when `card` produces the given token or emblem. Matched by name because
 * `all_parts` entries expose only `id`/`name`/`type_line` (no `oracle_id`), and a
 * token/emblem name is stable across prints.
 */
export function cardProducesToken(card: CardWithParts, token: { name: string }): boolean {
	return (card.all_parts ?? []).some(
		(part) => isProducedToken(part, card.id) && part.name === token.name
	);
}
