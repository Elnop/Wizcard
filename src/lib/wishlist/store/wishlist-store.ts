'use client';

import { create } from 'zustand';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { fetchWishlistPage } from '../db/wishlist';
import { enqueue } from '@/lib/supabase/sync-queue';
import { buildEntriesBatch } from '@/lib/card/entry/buildEntriesBatch';

type StoredCopy = { scryfallId: string; entry: CardEntry };
export type WishlistData = Record<string, StoredCopy>; // key = rowId

type WishlistState = {
	entries: WishlistData;
	isLoaded: boolean;
};

type WishlistActions = {
	hydrateFromSupabase: (userId: string) => Promise<void>;
	handleLogout: () => void;
	addToWishlist: (
		card: ScryfallCard,
		userId: string | null,
		triggerSync: () => void,
		entryPatch?: Partial<CardEntry>,
		count?: number
	) => void;
	removeFromWishlist: (rowId: string, userId: string | null, triggerSync: () => void) => void;
	clearWishlist: (userId: string | null, triggerSync: () => void) => void;
	changePrint: (
		rowId: string,
		newScryfallId: string,
		userId: string | null,
		triggerSync: () => void,
		isDeckCard?: boolean
	) => void;
};

export const useWishlistStore = create<WishlistState & WishlistActions>()((set, get) => ({
	entries: {},
	isLoaded: false,

	hydrateFromSupabase: async (userId) => {
		let from = 0;
		while (true) {
			const { rows, hasMore } = await fetchWishlistPage(userId, from);
			const current = get().entries;
			const merged: WishlistData = { ...current };
			for (const copy of rows) merged[copy.entry.rowId] = copy;
			set({ entries: merged, isLoaded: true });
			if (!hasMore) break;
			from += 1000;
		}
	},

	handleLogout: () => {
		set({ entries: {}, isLoaded: true });
	},

	addToWishlist: (card, userId, triggerSync, entryPatch, count = 1) => {
		const rows = buildEntriesBatch(card.id, count, entryPatch);
		set((state) => {
			const next = { ...state.entries };
			for (const { rowId, scryfallId, entry } of rows) {
				next[rowId] = { scryfallId, entry };
			}
			return { entries: next };
		});
		if (userId) {
			enqueue({ type: 'bulk-insert', payload: { userId, rows, wishlist: true } });
			triggerSync();
		}
	},

	removeFromWishlist: (rowId, userId, triggerSync) => {
		const current = get().entries;
		if (!current[rowId]) return;
		const next = { ...current };
		delete next[rowId];
		set({ entries: next });
		if (userId) {
			enqueue({ type: 'delete', payload: { userId, rowId } });
			triggerSync();
		}
	},

	clearWishlist: (userId, triggerSync) => {
		const current = get().entries;
		set({ entries: {} });
		if (userId) {
			const rowIds = Object.keys(current);
			if (rowIds.length > 0) {
				enqueue({ type: 'bulk-delete', payload: { userId, rowIds } });
			}
			triggerSync();
		}
	},

	changePrint: (rowId, newScryfallId, userId, triggerSync, isDeckCard) => {
		const current = get().entries;
		const copy = current[rowId];
		if (!copy) return;
		// Patch the existing row in place (same rowId) so the card keeps its
		// identity. The cards row is shared with the deck/collection views, so
		// minting a new rowId would orphan those links (the deck card would no
		// longer be recognised as wishlisted).
		const updatedCopy: StoredCopy = { scryfallId: newScryfallId, entry: copy.entry };
		set({ entries: { ...current, [rowId]: updatedCopy } });
		if (!userId) return;
		// A wishlisted deck card has no owner_id, so the owner-filtered collection
		// `update` op would not match it. Persist via `deck-card-update` (matches on
		// id only) instead. Standalone wishlist cards keep the owner-scoped update.
		if (isDeckCard) {
			enqueue({
				type: 'deck-card-update',
				payload: { rowId, updates: { scryfall_id: newScryfallId } },
			});
		} else {
			enqueue({
				type: 'update',
				payload: { userId, rowId, entry: copy.entry, scryfallId: newScryfallId },
			});
		}
		triggerSync();
	},
}));
