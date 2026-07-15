'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { AddToDeckModal } from '@/lib/card/components/AddToDeckModal/AddToDeckModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { getOracleId } from '@/lib/scryfall/store/cards-store';
import { deriveDeckTarget, type DeckTarget } from '@/lib/card/deriveDeckTarget';
import { useCloseOnRouteChange } from '@/contexts/useCloseOnRouteChange';

type AddToDeckModalContextValue = {
	/** Open the "add to deck" modal for any card; behaviour is derived from its type. */
	openAddToDeck: (card: AnyCard) => void;
	close: () => void;
};

const AddToDeckModalContext = createContext<AddToDeckModalContextValue | null>(null);

/**
 * Global provider that owns the "add to deck" modal state AND renders the modal
 * once at the root. Pages just call `openAddToDeck(card)` — the assignment mode
 * (owned collection rows / wishlist in-place / new copies) is derived from the
 * card's type, so no per-page params are needed.
 */
export function AddToDeckModalProvider({ children }: { children: React.ReactNode }) {
	const { entries: collectionEntries } = useCollectionContext();
	const { entries: wishlistEntries, assignToDeck } = useWishlistContext();
	const [target, setTarget] = useState<DeckTarget | null>(null);

	const openAddToDeck = useCallback(
		(card: AnyCard) => {
			setTarget(
				deriveDeckTarget(card, collectionEntries, wishlistEntries, assignToDeck, getOracleId)
			);
		},
		[collectionEntries, wishlistEntries, assignToDeck]
	);

	const close = useCallback(() => setTarget(null), []);
	useCloseOnRouteChange(close);

	const value = useMemo<AddToDeckModalContextValue>(
		() => ({ openAddToDeck, close }),
		[openAddToDeck, close]
	);

	return (
		<AddToDeckModalContext.Provider value={value}>
			{children}
			{target && (
				<AddToDeckModal
					card={target.card}
					ownedRowIds={target.ownedRowIds}
					onAssign={target.onAssign}
					onClose={close}
				/>
			)}
		</AddToDeckModalContext.Provider>
	);
}

export function useAddToDeckModal(): AddToDeckModalContextValue {
	const ctx = useContext(AddToDeckModalContext);
	if (!ctx) throw new Error('useAddToDeckModal must be used within an AddToDeckModalProvider');
	return ctx;
}
