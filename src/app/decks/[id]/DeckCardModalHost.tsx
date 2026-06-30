'use client';

import { useState } from 'react';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { AddCardToCollectionModal } from './components/AddCardToCollectionModal/AddCardToCollectionModal';
import { RemoveDeckCardModal } from './components/RemoveDeckCardModal/RemoveDeckCardModal';
import { useDeckCardModalProps } from './useDeckCardModalProps';

type Props = {
	deckId: string;
	oracleKey: string;
	clickedRowId: string;
	/** Tear down the whole deck-modal open-state in the provider. */
	onClose: () => void;
	/** Re-open the deck modal on another card (used by token producer clicks). */
	onReopen: (oracleKey: string, clickedRowId: string) => void;
};

/**
 * Renders the deck-owner `<CardModal>` and its two satellite sub-flows. Mounted by
 * `CardModalProvider` only while a deck card is open, so the side-effectful deck
 * hooks inside `useDeckCardModalProps` (loadDeck / Scryfall resolution) never run
 * on non-deck pages.
 *
 * The host stays mounted while a satellite (`pendingRemove`) is resolving even
 * after the card modal itself is dismissed — `cardModalDismissed` hides only the
 * `<CardModal>`, while `onClose` (provider tear-down) is deferred until the
 * satellite closes.
 */
export function DeckCardModalHost({ deckId, oracleKey, clickedRowId, onClose, onReopen }: Props) {
	const { toggleOwned, removeCardFromDeck } = useDeckContext();
	const { removeFromWishlist } = useWishlistContext();
	const [cardModalDismissed, setCardModalDismissed] = useState(false);

	const { props, pendingCollectionAdd, setPendingCollectionAdd, pendingRemove, setPendingRemove } =
		useDeckCardModalProps(deckId, oracleKey, clickedRowId, onReopen);

	return (
		<>
			{!cardModalDismissed && (
				<CardModal
					cards={props.cards}
					initialRowId={props.initialRowId}
					zone={props.zone}
					availableZones={props.availableZones}
					onClose={onClose}
					onSave={props.onSave}
					onRemoveEntry={(rowId) => {
						// Defer provider tear-down: the RemoveDeckCardModal must outlive the
						// card modal. Hide the card modal, keep the host mounted.
						setCardModalDismissed(true);
						props.onRemoveEntry(rowId);
					}}
					onIncrement={props.onIncrement}
					onChangeZone={props.onChangeZone}
					onChangePrint={props.onChangePrint}
					collectionCopies={props.collectionCopies}
					onAssignCollectionCopy={props.onAssignCollectionCopy}
					onUnassignCollectionCopy={props.onUnassignCollectionCopy}
					onAddToCollectionFromEntry={props.onAddToCollectionFromEntry}
					onRemoveFromCollectionEntry={props.onRemoveFromCollectionEntry}
					onAddToWishlistFromEntry={props.onAddToWishlistFromEntry}
					producerSections={props.producerSections}
					onProducerClick={(card) => {
						const c = card as { oracle_id?: string; id: string; entry: { rowId: string } };
						props.onProducerClick(c.oracle_id ?? c.id, c.entry.rowId);
					}}
					renderCopyBadge={props.renderCopyBadge}
				/>
			)}

			{pendingCollectionAdd && (
				<AddCardToCollectionModal
					cardName={pendingCollectionAdd.cardName}
					unownedRowIds={pendingCollectionAdd.unownedRowIds}
					wishlistMatchCount={pendingCollectionAdd.wishlistRowIds.length}
					onConfirm={({ rowIds, asProxy, removeWishlist }) => {
						for (const rowId of rowIds) toggleOwned(rowId, asProxy);
						if (removeWishlist) {
							for (const rowId of pendingCollectionAdd.wishlistRowIds) removeFromWishlist(rowId);
						}
						setPendingCollectionAdd(null);
					}}
					onClose={() => setPendingCollectionAdd(null)}
				/>
			)}

			{pendingRemove && (
				<RemoveDeckCardModal
					cardName={pendingRemove.cardName}
					membership={pendingRemove.membership}
					onConfirm={({ alsoRemove }) => {
						removeCardFromDeck(pendingRemove.rowId, alsoRemove ? 'delete' : 'detach');
						setPendingRemove(null);
						onClose();
					}}
					onClose={() => {
						setPendingRemove(null);
						onClose();
					}}
				/>
			)}
		</>
	);
}
