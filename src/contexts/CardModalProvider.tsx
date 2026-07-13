'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Card, CardEntry, CardStack } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { DeckCardGroup } from '@/types/decks';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { DeckCardModalHost } from '@/app/[locale]/decks/[id]/DeckCardModalHost';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { getCard } from '@/lib/scryfall/store/cards-store';
import { putCardsInCache } from '@/lib/scryfall/utils/card-cache';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import { deriveCardModalProps } from '@/lib/card/deriveCardModalProps';
import { useCardMutations } from '@/lib/card/hooks/useCardMutations';
import { buildOwnedCardMenu, type OwnedCardMenuLabels } from '@/lib/card/ownedCardMenu';
import { useOwnedCardMenuLabels } from '@/lib/card/hooks/useOwnedCardMenuLabels';
import { buildViewerCardMenu, type ViewerCardMenuLabels } from '@/lib/card/viewerCardMenu';
import { useViewerCardMenuLabels } from '@/lib/card/hooks/useViewerCardMenuLabels';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';

type StoredCopy = { scryfallId: string; entry: CardEntry };

/** What was opened.
 *  - 'stack': owned/wishlisted card from THIS user's data — re-resolved from the
 *    live contexts each render (so it tracks mutations + print changes).
 *  - 'frozen': read-only cards passed verbatim (e.g. another user's public
 *    collection) — never re-resolved against the signed-in user's contexts.
 *  - 'bare': a single Scryfall/custom card (search/sets/prints). */
type OpenState =
	| { kind: 'stack'; oracleKey: string }
	| { kind: 'frozen'; cards: Card[] }
	| { kind: 'bare'; card: ScryfallCard | CustomCard }
	| { kind: 'deck'; deckId: string; oracleKey: string; clickedRowId: string }
	| null;

type CardModalContextValue = {
	/** Open the modal for a bare card (search/sets/prints) or a resolved stack's cards. */
	openCardModal: (input: ScryfallCard | CustomCard | Card[], opts?: { readOnly?: boolean }) => void;
	/**
	 * Open the deck-owner modal for a clicked deck-card group. Deck state lives on
	 * the page; the call-site already has the group, so we pass it through and the
	 * provider re-resolves the live stack by oracle key + deckId.
	 */
	openDeckCardModal: (deckId: string, group: DeckCardGroup, clickedRowId: string) => void;
	close: () => void;
};

const CardModalContext = createContext<CardModalContextValue | null>(null);

const oracleKeyOf = (card: { oracle_id?: string; id: string }) => card.oracle_id ?? card.id;

/** Strip identity/ownership fields so a moved wishlist copy is minted fresh in
 *  the collection (mirrors useMoveToCollection.buildInitialEntry). */
function buildMoveInitialEntry(entry: CardEntry): Partial<CardEntry> {
	const patch: Partial<CardEntry> = { ...entry };
	delete patch.rowId;
	delete patch.dateAdded;
	delete patch.deckId;
	delete patch.ownerId;
	delete patch.wishlist;
	return patch;
}

/** Primitives the modal's image context menu acts on. Passed to the module-level
 *  builders below so the deeply-nested inline arrows stay out of the component. */
type ImageMenuDeps = {
	mutations: ReturnType<typeof useCardMutations>;
	requestMoveToCollection: (rowId: string) => void;
	openAddToDeck: (card: AnyCard) => void;
	openAddCard: (params: {
		scryfallCard: ScryfallCard;
		onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	}) => void;
	addToCollection: (card: ScryfallCard, count: number, entry: Partial<CardEntry>) => void;
	addToWishlist: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	closeModal: () => void;
};

/** Owner image menu (own collection/wishlist card). Mirrors `useOwnedCardMenuHandlers`. */
function buildOwnedImageMenu(
	stack: CardStack,
	source: 'collection' | 'wishlist',
	deps: ImageMenuDeps,
	closeMenu: () => void,
	labels: OwnedCardMenuLabels
): ContextMenuAction[] {
	const { mutations } = deps;
	const isWishlist = source === 'wishlist';
	return buildOwnedCardMenu(
		stack,
		source,
		{
			// Already viewing this card in the modal — no re-open needed.
			onViewDetails: () => {},
			onChangePrint: () => {},
			onAddCopy: (r) =>
				isWishlist
					? mutations.wishlist.duplicate(r.id, r.entry)
					: mutations.collection.duplicate(r.id, r.entry),
			onRemoveCopy: (r) =>
				isWishlist
					? mutations.wishlist.remove(r.entry.rowId)
					: mutations.collection.decrement(r.id),
			onMove: (r) =>
				isWishlist
					? deps.requestMoveToCollection(r.entry.rowId)
					: mutations.moveToWishlist(r.entry.rowId),
			onAddToDeck: (s) => deps.openAddToDeck(s.cards[0]),
			onRemove: (r) => {
				if (isWishlist) mutations.wishlist.remove(r.entry.rowId);
				else mutations.collection.remove(r.id);
				deps.closeModal();
			},
		},
		closeMenu,
		labels
	);
}

/** Viewer image menu (another user's card / bare search card): acts on MY lists. */
function buildViewerImageMenu(
	card: AnyCard,
	deps: ImageMenuDeps,
	closeMenu: () => void,
	labels: ViewerCardMenuLabels
): ContextMenuAction[] {
	return buildViewerCardMenu(
		card,
		{
			// Already open in the modal.
			onViewDetails: () => {},
			onAddToCollection: (c) =>
				deps.openAddCard({
					scryfallCard: c as ScryfallCard,
					onAdd: (sc, entry, count) => deps.addToCollection(sc, count, entry),
				}),
			onAddToWishlist: (c) =>
				deps.openAddCard({
					scryfallCard: c as ScryfallCard,
					onAdd: (sc, entry, count) => deps.addToWishlist(sc, entry, count),
				}),
			onAddToDeck: (c) => deps.openAddToDeck(c),
		},
		closeMenu,
		labels
	);
}

/** Rebuild a stack's Card[] (all copies, same oracle key) from a context's entries
 *  + the global hydrated-cards store. Mirrors how the grid derives stacks. */
function resolveStackCards(oracleKey: string, entries: StoredCopy[]): Card[] {
	const result: Card[] = [];
	for (const { scryfallId, entry } of entries) {
		const scryfall = getCard(scryfallId);
		if (!scryfall) continue;
		if (oracleKeyOf(scryfall) !== oracleKey) continue;
		result.push({ ...scryfall, entry });
	}
	return result;
}

/**
 * Global provider that owns the card-modal open-state and renders `<CardModal>`
 * once at the root. Mutation handlers are derived from the card TYPE via
 * `deriveCardModalProps`; the provider additionally owns the stateful
 * change-print "dance" (keep the modal open and re-targeted on the new print)
 * for owned/wishlisted cards — generalising the former `useCardModal` hook.
 *
 * Out of scope (still rendered locally): the deck-owner modal, the import
 * modals, and CardModal's internal recursive token render.
 */
export function CardModalProvider({ children }: { children: React.ReactNode }) {
	const collectionMenuLabels = useOwnedCardMenuLabels('collection');
	const wishlistMenuLabels = useOwnedCardMenuLabels('wishlist');
	const viewerMenuLabels = useViewerCardMenuLabels();
	const collection = useCollectionContext();
	const wishlist = useWishlistContext();
	const { openAddToDeck } = useAddToDeckModal();
	const { openAddCard } = useAddCardModal();
	const mutations = useCardMutations();

	const [open, setOpen] = useState<OpenState>(null);

	const openCardModal = useCallback(
		(input: ScryfallCard | CustomCard | Card[], opts?: { readOnly?: boolean }) => {
			if (Array.isArray(input)) {
				const rep = input[0];
				if (!rep) return;
				// Read-only stacks (another user's collection) are frozen — never
				// re-resolved against the signed-in user's contexts.
				if (opts?.readOnly) setOpen({ kind: 'frozen', cards: input });
				else setOpen({ kind: 'stack', oracleKey: oracleKeyOf(rep) });
			} else {
				setOpen({ kind: 'bare', card: input });
			}
		},
		[]
	);

	const openDeckCardModal = useCallback(
		(deckId: string, group: DeckCardGroup, clickedRowId: string) => {
			const rep = group.representative;
			setOpen({ kind: 'deck', deckId, oracleKey: oracleKeyOf(rep), clickedRowId });
		},
		[]
	);

	// Token-producer clicks (inside the deck modal) re-target the open deck modal.
	const reopenDeckCard = useCallback((oracleKey: string, clickedRowId: string) => {
		setOpen((prev) => (prev?.kind === 'deck' ? { ...prev, oracleKey, clickedRowId } : prev));
	}, []);

	const close = useCallback(() => setOpen(null), []);

	// Re-resolve the displayed cards on every render so they track store mutations
	// (increment/decrement/change-print) without the modal losing its target.
	const resolved = useMemo<{
		cards: Card[] | ScryfallCard | CustomCard | null;
		rep: AnyCard | null;
		source: 'collection' | 'wishlist' | null;
	}>(() => {
		if (!open) return { cards: null, rep: null, source: null };
		// Deck cards are rendered by DeckCardModalHost (its own derivation), never
		// re-resolved against the collection/wishlist here.
		if (open.kind === 'deck') return { cards: null, rep: null, source: null };
		if (open.kind === 'bare') return { cards: open.card, rep: open.card, source: null };
		if (open.kind === 'frozen') {
			// Verbatim, read-only — no mutations derived (source stays null).
			return { cards: open.cards.length > 0 ? open.cards : null, rep: null, source: null };
		}
		// Stack: figure out which context owns it from the first matching entry.
		const inCollection = resolveStackCards(open.oracleKey, collection.entries);
		const inWishlist = resolveStackCards(open.oracleKey, wishlist.entries);
		const isWishlist = inWishlist.length > 0 && inCollection.length === 0;
		const cards = isWishlist ? inWishlist : inCollection;
		return {
			cards: cards.length > 0 ? cards : null,
			rep: cards[0] ?? null,
			source: isWishlist ? 'wishlist' : 'collection',
		};
	}, [open, collection.entries, wishlist.entries]);

	// Stateful change-print: persist the print change, then re-target the open
	// stack to the new print's oracle key so the modal keeps showing it.
	const handleChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard, source: 'collection' | 'wishlist') => {
			void putCardsInCache([newCard]);
			const language = newCard.lang ? SCRYFALL_CODE_TO_LANGUAGE[newCard.lang] : undefined;
			if (source === 'wishlist') {
				wishlist.changePrint(rowId, newCard.id);
			} else {
				collection.changePrint(rowId, newCard.id, language ? { language } : undefined);
			}
			setOpen({ kind: 'stack', oracleKey: oracleKeyOf(newCard) });
		},
		[collection, wishlist]
	);

	// Wishlist "move to collection": open AddCardModal pre-filled from the
	// wishlist copy; on confirm commit the move and close the card modal.
	const requestMoveToCollection = useCallback(
		(rowId: string) => {
			const oracleKey = (() => {
				const sc = wishlist.entries.find((e) => e.entry.rowId === rowId);
				const card = sc ? getCard(sc.scryfallId) : undefined;
				return card ? oracleKeyOf(card) : undefined;
			})();
			if (!oracleKey) return;
			const stackCards = resolveStackCards(oracleKey, wishlist.entries);
			const rep = stackCards[0];
			if (!rep) return;
			openAddCard({
				scryfallCard: rep as ScryfallCard,
				initialEntry: buildMoveInitialEntry(rep.entry),
				maxQuantity: stackCards.length,
				hideQuantity: stackCards.length <= 1,
				onAdd: (selectedPrint, entry, count) => {
					const rowIds = stackCards.slice(0, count).map((c) => c.entry.rowId);
					wishlist.moveToCollection(rowIds, selectedPrint.id, entry);
					close();
				},
			});
		},
		[wishlist, openAddCard, close]
	);

	const derivedProps = useMemo(() => {
		// No rep ⇒ frozen/read-only ⇒ no mutation handlers derived.
		if (!open || !resolved.rep) return null;
		const deps = {
			collection: {
				addCard: collection.addCard,
				addCards: collection.addCards,
				duplicateEntry: collection.duplicateEntry,
				decrementCard: collection.decrementCard,
				removeCard: collection.removeCard,
				removeEntry: collection.removeEntry,
				updateEntry: collection.updateEntry,
				changePrint: collection.changePrint,
			},
			wishlist: {
				addToWishlist: wishlist.addToWishlist,
				removeFromWishlist: wishlist.removeFromWishlist,
				moveToCollection: requestMoveToCollection,
				changePrint: wishlist.changePrint,
			},
			openAddToDeck,
			close,
		};
		const base = deriveCardModalProps(resolved.rep, deps);
		// Override the stateless change-print with the stateful dance.
		if (resolved.source) {
			base.onChangePrint = (rowId, newCard) => handleChangePrint(rowId, newCard, resolved.source!);
		}
		return base;
	}, [
		open,
		resolved,
		collection,
		wishlist,
		openAddToDeck,
		close,
		handleChangePrint,
		requestMoveToCollection,
	]);

	// Right-click menu for the modal's main image. Mirrors the card grid: the
	// owner (own data → `stack`) gets the full owned menu; a viewer (another
	// user's card → `frozen`, or a bare search card → `bare`) gets the viewer menu
	// acting on their OWN lists. This is what unlocks actions on a frozen modal,
	// where no mutation handlers are derived.
	const buildImageMenuItems = useMemo<
		((card: AnyCard, closeMenu: () => void) => ContextMenuAction[] | null) | undefined
	>(() => {
		if (!open || open.kind === 'deck') return undefined;

		const deps: ImageMenuDeps = {
			mutations,
			requestMoveToCollection,
			openAddToDeck,
			openAddCard,
			addToCollection: collection.addCards,
			addToWishlist: wishlist.addToWishlist,
			closeModal: close,
		};

		// Owner (own data) → full owned menu. Otherwise (frozen/bare) → viewer menu
		// on MY lists — this is what unlocks actions on another user's frozen modal.
		if (open.kind === 'stack' && resolved.source) {
			const stackCards = Array.isArray(resolved.cards) ? resolved.cards : [];
			const rep = stackCards[0];
			if (!rep) return undefined;
			const stack: CardStack = { oracleId: oracleKeyOf(rep), name: rep.name, cards: stackCards };
			const source = resolved.source;
			const labels = source === 'wishlist' ? wishlistMenuLabels : collectionMenuLabels;
			return (_card, closeMenu) => buildOwnedImageMenu(stack, source, deps, closeMenu, labels);
		}

		return (card, closeMenu) => buildViewerImageMenu(card, deps, closeMenu, viewerMenuLabels);
	}, [
		open,
		resolved,
		mutations,
		requestMoveToCollection,
		openAddToDeck,
		openAddCard,
		collection.addCards,
		wishlist.addToWishlist,
		close,
		collectionMenuLabels,
		wishlistMenuLabels,
		viewerMenuLabels,
	]);

	const value = useMemo<CardModalContextValue>(
		() => ({ openCardModal, openDeckCardModal, close }),
		[openCardModal, openDeckCardModal, close]
	);

	return (
		<CardModalContext.Provider value={value}>
			{children}
			{open?.kind === 'deck' ? (
				<DeckCardModalHost
					deckId={open.deckId}
					oracleKey={open.oracleKey}
					clickedRowId={open.clickedRowId}
					onClose={close}
					onReopen={reopenDeckCard}
				/>
			) : (
				open &&
				resolved.cards && (
					<CardModal
						cards={resolved.cards}
						onClose={close}
						{...(derivedProps ?? {})}
						buildImageMenuItems={buildImageMenuItems}
					/>
				)
			)}
		</CardModalContext.Provider>
	);
}

export function useCardModalContext(): CardModalContextValue {
	const ctx = useContext(CardModalContext);
	if (!ctx) throw new Error('useCardModalContext must be used within a CardModalProvider');
	return ctx;
}
