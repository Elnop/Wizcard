// src/lib/wishlist/bulk-actions.ts
import { useWishlistStore } from '@/lib/wishlist/store/wishlist-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { getLoadedDeckCard, patchLoadedDeckCard } from '@/lib/deck/store/deck-store';
import { applyBulkEdit, type BulkEdit } from '@/lib/card/bulk/bulk-edit';
import { entryDbPatch, isEmptyDbPatch } from '@/lib/card/db/entry-db-patch';
import type { BulkUpdateRow } from '@/lib/supabase/group-row-updates';
import { enqueue } from '@/lib/supabase/sync-queue';
import { planWishlistRemove } from './bulk-plans';

const BULK_UPDATE = 'bulk-update' as const;

const isLoadedDeckCard = (rowId: string) => getLoadedDeckCard(rowId) != null;

/** Bulk field edit; wishlisted deck cards are mirrored in their loaded deck. */
export function wishlistBulkUpdate(
	rowIds: string[],
	edit: BulkEdit,
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useWishlistStore.getState().entries;
	const next = { ...current };
	const rows: BulkUpdateRow[] = [];
	for (const rowId of rowIds) {
		const copy = current[rowId];
		if (!copy) continue;
		const entry = applyBulkEdit(copy.entry, edit);
		const updates = entryDbPatch(copy.entry, entry);
		if (isEmptyDbPatch(updates)) continue;
		next[rowId] = { ...copy, entry };
		rows.push({ rowId, updates });
		patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: applyBulkEdit(c.entry, edit) }));
	}
	if (rows.length === 0) return;
	useWishlistStore.setState({ entries: next });
	if (userId) {
		enqueue({ type: BULK_UPDATE, payload: { rows } });
		triggerSync();
	}
}

export function wishlistBulkRemove(
	rowIds: string[],
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useWishlistStore.getState().entries;
	const copies = rowIds.flatMap((rowId) =>
		current[rowId] ? [{ rowId, entry: current[rowId].entry }] : []
	);
	if (copies.length === 0) return;
	const { deleteIds, unflagIds } = planWishlistRemove(copies, isLoadedDeckCard);

	const next = { ...current };
	for (const { rowId } of copies) delete next[rowId];
	useWishlistStore.setState({ entries: next });
	for (const rowId of unflagIds) {
		patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: { ...c.entry, wishlist: undefined } }));
	}

	if (!userId) return;
	if (deleteIds.length > 0)
		enqueue({ type: 'bulk-delete', payload: { userId, rowIds: deleteIds } });
	if (unflagIds.length > 0) {
		enqueue({
			type: BULK_UPDATE,
			payload: { rows: unflagIds.map((rowId) => ({ rowId, updates: { wishlist: false } })) },
		});
	}
	triggerSync();
}

/**
 * Flip in place (same rowId): wishlist=false, owner_id=userId. Printing and
 * metadata are kept. owner_id is required for deck cards (NULL owner) and a
 * no-op for pure wishlist rows (already owned by the user).
 */
export function wishlistBulkMoveToCollection(
	rowIds: string[],
	userId: string | null,
	triggerSync: () => void
): void {
	const wishlistEntries = useWishlistStore.getState().entries;
	const colEntries = useCollectionStore.getState().entries;
	const nextWishlist = { ...wishlistEntries };
	const nextCollection = { ...colEntries };
	const moved: string[] = [];
	for (const rowId of rowIds) {
		const copy = wishlistEntries[rowId];
		if (!copy) continue;
		delete nextWishlist[rowId];
		nextCollection[rowId] = {
			scryfallId: copy.scryfallId,
			entry: { ...copy.entry, rowId, wishlist: false },
		};
		patchLoadedDeckCard(rowId, (c) => ({
			...c,
			entry: { ...c.entry, wishlist: undefined, ownerId: userId ?? undefined },
		}));
		moved.push(rowId);
	}
	if (moved.length === 0) return;
	useWishlistStore.setState({ entries: nextWishlist });
	useCollectionStore.setState({ entries: nextCollection });
	if (userId) {
		enqueue({
			type: BULK_UPDATE,
			payload: {
				rows: moved.map((rowId) => ({ rowId, updates: { wishlist: false, owner_id: userId } })),
			},
		});
		triggerSync();
	}
}
