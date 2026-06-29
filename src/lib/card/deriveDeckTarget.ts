import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';

type StoredCopy = { scryfallId: string; entry: CardEntry };
type AssignFn = (rowIds: string[], deckId: string, zone: DeckZone) => void;

export type DeckTarget = {
	card: ScryfallCard;
	ownedRowIds?: string[];
	onAssign?: AssignFn;
};

function hasEntry(card: AnyCard): card is AnyCard & { entry: CardEntry } {
	return 'entry' in card;
}

/**
 * Resolves how an "add to deck" should behave purely from the card's TYPE,
 * mirroring the previous per-page wiring:
 *
 * - Owned (`entry`, not wishlisted)  → assign owned collection rows (no onAssign).
 * - Wishlisted (`entry.wishlist`)    → assign in place via `assignToDeck` (rows
 *   have owner_id=NULL and are invisible to the collection assign path).
 * - Bare Scryfall card (no `entry`)  → create new deck copies (no ownedRowIds).
 *
 * `ownedRowIds` are ALL copies of the logical card (grouped by oracle_id, all
 * editions) — matching the old `stack.cards.map(c => c.entry.rowId)`. The
 * oracle id comes from the card itself, falling back to the global cards store
 * (`getOracleId`); if still unknown (card never hydrated), it degrades to rows
 * of the same print (scryfallId), never erroring.
 */
export function deriveDeckTarget(
	card: AnyCard,
	collectionEntries: StoredCopy[],
	wishlistEntries: StoredCopy[],
	assignToDeck: AssignFn,
	getOracleId: (scryfallId: string) => string | undefined
): DeckTarget {
	if (!hasEntry(card)) {
		return { card: card as ScryfallCard };
	}

	const isWishlisted = card.entry.wishlist === true;
	const source = isWishlisted ? wishlistEntries : collectionEntries;
	const oracleId = card.oracle_id ?? getOracleId(card.id);

	const ownedRowIds = source
		.filter((copy) =>
			oracleId ? getOracleId(copy.scryfallId) === oracleId : copy.scryfallId === card.id
		)
		.map((copy) => copy.entry.rowId);

	return {
		card: card as ScryfallCard,
		ownedRowIds,
		onAssign: isWishlisted ? assignToDeck : undefined,
	};
}
