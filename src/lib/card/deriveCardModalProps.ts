import type { Card, CardEntry } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/**
 * The subset of CardModal props this helper produces. Mirrors the mutation
 * callbacks the simple (non-deck) sites used to pass by hand. `cards` and
 * `onClose` are supplied by the provider, not here.
 */
export type DerivedCardModalProps = {
	onSave?: (rowId: string, updates: Partial<CardEntry>) => void;
	onRemove?: (scryfallId: string) => void;
	onRemoveEntry?: (rowId: string) => void;
	onDuplicate?: (scryfallId: string, entry: CardEntry) => void;
	onIncrement?: (entry: Partial<CardEntry>) => void;
	onDecrement?: () => void;
	onChangePrint?: (rowId: string, newCard: ScryfallCard) => void;
	onMoveToCollection?: (rowId: string) => void;
	onAddToCollection?: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	onAddToWishlist?: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	onAddToDeck?: (card: ScryfallCard) => void;
};

/** Global mutation primitives the helper wires into the modal's callbacks. */
export type CardModalDeps = {
	collection: {
		addCard: (card: ScryfallCard, entryPatch?: Partial<CardEntry>) => void;
		addCards: (card: ScryfallCard, count: number, entryPatch?: Partial<CardEntry>) => void;
		duplicateEntry: (scryfallId: string, sourceEntry: CardEntry) => void;
		decrementCard: (scryfallId: string) => void;
		removeCard: (scryfallId: string) => void;
		removeEntry: (rowId: string) => void;
		updateEntry: (rowId: string, updates: Partial<CardEntry>) => void;
		changePrint: (rowId: string, newScryfallId: string, entryPatch?: Partial<CardEntry>) => void;
	};
	wishlist: {
		addToWishlist: (card: ScryfallCard, entryPatch: Partial<CardEntry>, count: number) => void;
		removeFromWishlist: (rowId: string) => void;
		moveToCollection: (rowId: string) => void;
		changePrint: (rowId: string, newScryfallId: string) => void;
	};
	/** Opens the global "add to deck" modal (AddToDeckModalProvider). */
	openAddToDeck: (card: AnyCard) => void;
	/** Closes the card modal (used by handlers that should dismiss after acting). */
	close: () => void;
};

function hasEntry(card: AnyCard): card is Card {
	return 'entry' in card;
}

/**
 * Pure derivation of CardModal mutation props from a card's TYPE, for the simple
 * (non-deck) cases. Deck cards (`entry.deckId`) are handled by the stateful
 * `useDeckCardModalProps` hook + `DeckCardModalHost` instead — the provider routes
 * them through `openDeckCardModal` rather than this helper.
 *
 * - Bare Scryfall/custom (no entry) → add-to-collection / add-to-wishlist / add-to-deck.
 * - Owned (entry, not wishlisted) → full collection edit suite.
 * - Wishlisted (entry.wishlist) → wishlist edit suite + move-to-collection.
 */
export function deriveCardModalProps(card: AnyCard, deps: CardModalDeps): DerivedCardModalProps {
	const onAddToDeck = (c: ScryfallCard) => deps.openAddToDeck(c);

	// Bare card from search/sets/prints — only "add" actions apply.
	if (!hasEntry(card)) {
		return {
			onAddToCollection: (c, entry, count) => deps.collection.addCards(c, count, entry),
			onAddToWishlist: (c, entry, count) => deps.wishlist.addToWishlist(c, entry, count),
			onAddToDeck,
		};
	}

	if (card.entry.wishlist) {
		// Wishlisted card.
		return {
			onRemoveEntry: (rowId) => deps.wishlist.removeFromWishlist(rowId),
			onChangePrint: (rowId, newCard) => deps.wishlist.changePrint(rowId, newCard.id),
			onMoveToCollection: (rowId) => deps.wishlist.moveToCollection(rowId),
			onAddToDeck,
		};
	}

	// Owned collection card. `onDecrement` is arg-less (the modal decrements the
	// displayed card), so we close over this card's scryfall id.
	const ownedCard = card as Card & ScryfallCard;
	return {
		onSave: (rowId, updates) => deps.collection.updateEntry(rowId, updates),
		onRemove: (scryfallId) => {
			deps.collection.removeCard(scryfallId);
			deps.close();
		},
		onRemoveEntry: (rowId) => deps.collection.removeEntry(rowId),
		onDuplicate: (scryfallId, entry) => deps.collection.duplicateEntry(scryfallId, entry),
		onIncrement: (entry) => deps.collection.addCard(ownedCard, entry),
		onDecrement: () => deps.collection.decrementCard(ownedCard.id),
		onChangePrint: (rowId, newCard) => deps.collection.changePrint(rowId, newCard.id),
		onAddToDeck,
	};
}
