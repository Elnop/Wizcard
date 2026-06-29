'use client';

import { useMemo } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import type { CardEntry } from '@/types/cards';

/**
 * Optional UI reaction co-located with a mutation (e.g. close the card modal
 * after removing the last copy). This is the "react to a mutation" orchestration
 * — passed at the call site so the hook never needs to know about page modals.
 */
type MutationOptions = { onAfter?: () => void };

/**
 * Pure card mutations, factored out of the pages so collection/wishlist stop
 * re-destructuring + re-wrapping the same context methods by hand. The hook
 * consumes the data contexts directly (it is a hook, not a presentational
 * component — coupling is fine here). Mutations are grouped by target context
 * to keep `duplicate` unambiguous (it exists on both contexts).
 *
 * Every mutation accepts a trailing `{ onAfter }` to co-locate a post-mutation
 * UI reaction with the mutation itself.
 */
export function useCardMutations() {
	const col = useCollectionContext();
	const wl = useWishlistContext();

	return useMemo(
		() => ({
			collection: {
				duplicate: (scryfallId: string, entry: CardEntry, opts?: MutationOptions) => {
					col.duplicateEntry(scryfallId, entry);
					opts?.onAfter?.();
				},
				decrement: (scryfallId: string, opts?: MutationOptions) => {
					col.decrementCard(scryfallId);
					opts?.onAfter?.();
				},
				remove: (scryfallId: string, opts?: MutationOptions) => {
					col.removeCard(scryfallId);
					opts?.onAfter?.();
				},
			},
			wishlist: {
				duplicate: (scryfallId: string, entry: CardEntry, opts?: MutationOptions) => {
					wl.duplicateEntry(scryfallId, entry);
					opts?.onAfter?.();
				},
				remove: (rowId: string, opts?: MutationOptions) => {
					wl.removeFromWishlist(rowId);
					opts?.onAfter?.();
				},
			},
			/** Move owned rows into the wishlist (collection → wishlist). */
			moveToWishlist: (rowId: string, opts?: MutationOptions) => {
				wl.moveToWishlist([rowId]);
				opts?.onAfter?.();
			},
		}),
		[col, wl]
	);
}
