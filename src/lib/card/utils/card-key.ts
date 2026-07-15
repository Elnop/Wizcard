import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';

/**
 * Stable React key for a card in a list.
 *
 * A card's Scryfall `id` identifies the *printing*, not the copy — a deck or
 * collection can hold several copies of the same printing, all sharing that id.
 * Using `id` as a React key then produces duplicate keys (dropped/duplicated
 * DOM). Collection/deck cards carry a unique `entry.rowId` per physical copy, so
 * prefer that; fall back to `id` for pure Scryfall/custom cards (search results,
 * tokens) which have no entry.
 */
export function cardKey(card: AnyCard): string {
	return 'entry' in card ? card.entry.rowId : card.id;
}
