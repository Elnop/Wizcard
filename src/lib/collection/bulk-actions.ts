// src/lib/collection/bulk-actions.ts
import type { CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { useDeckStore, patchLoadedDeckCard } from '@/lib/deck/store/deck-store';
import { applyBulkEdit, type BulkEdit } from '@/lib/card/bulk/bulk-edit';
import { entryDbPatch, isEmptyDbPatch } from '@/lib/card/db/entry-db-patch';
import type { BulkUpdateRow } from '@/lib/supabase/group-row-updates';
import { enqueue } from '@/lib/supabase/sync-queue';
import { planAssignToDeck, planCollectionRemove } from './bulk-plans';

const BULK_UPDATE = 'bulk-update' as const;

type StoredCopy = { scryfallId: string; entry: CardEntry };

/** Bulk field edit; deck-linked copies are mirrored in their loaded deck. */
export function collectionBulkUpdate(
	rowIds: string[],
	edit: BulkEdit,
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useCollectionStore.getState().entries;
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
		if (copy.entry.deckId) {
			patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: applyBulkEdit(c.entry, edit) }));
		}
	}
	if (rows.length === 0) return;
	useCollectionStore.setState({ entries: next });
	if (userId) {
		enqueue({ type: BULK_UPDATE, payload: { rows } });
		triggerSync();
	}
}

/** Free copies deleted; deck-linked copies detached (stay in their deck, unowned). */
export function collectionBulkRemove(
	rowIds: string[],
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useCollectionStore.getState().entries;
	const copies = rowIds.flatMap((rowId) =>
		current[rowId] ? [{ rowId, entry: current[rowId].entry }] : []
	);
	const { deleteIds, detachIds } = planCollectionRemove(copies);
	if (deleteIds.length + detachIds.length === 0) return;

	const next = { ...current };
	for (const { rowId } of copies) delete next[rowId];
	useCollectionStore.setState({ entries: next });
	for (const rowId of detachIds) {
		patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: { ...c.entry, ownerId: undefined } }));
	}

	if (!userId) return;
	if (deleteIds.length > 0)
		enqueue({ type: 'bulk-delete', payload: { userId, rowIds: deleteIds } });
	if (detachIds.length > 0) {
		enqueue({
			type: BULK_UPDATE,
			payload: { rows: detachIds.map((rowId) => ({ rowId, updates: { owner_id: null } })) },
		});
	}
	triggerSync();
}

/**
 * Attach the copies themselves to `deckId` (deck_id + zone tag on the row). A
 * copy already in another deck leaves it. Loaded decks are patched in memory;
 * an unloaded deck re-reads the DB when it opens (`hydrateActiveDeck`).
 */
export function collectionBulkAssignToDeck(
	rowIds: string[],
	deckId: string,
	zone: DeckZone,
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useCollectionStore.getState().entries;
	const copies = rowIds.flatMap((rowId) =>
		current[rowId] ? [{ rowId, entry: current[rowId].entry }] : []
	);
	const plan = planAssignToDeck(copies, deckId, zone);
	if (plan.length === 0) return;

	const nextCollection = { ...current };
	const rows: BulkUpdateRow[] = [];
	const deckState = useDeckStore.getState();
	const decksCards: Record<string, Record<string, StoredCopy>> = { ...deckState.decksCards };
	const targetLoaded = decksCards[deckId] !== undefined;
	if (targetLoaded) decksCards[deckId] = { ...decksCards[deckId] };

	for (const p of plan) {
		const before = current[p.rowId];
		const updates = entryDbPatch(before.entry, p.entry);
		nextCollection[p.rowId] = { ...before, entry: p.entry };
		if (!isEmptyDbPatch(updates)) rows.push({ rowId: p.rowId, updates });

		if (p.fromDeckId && decksCards[p.fromDeckId]) {
			const source = { ...decksCards[p.fromDeckId] };
			delete source[p.rowId];
			decksCards[p.fromDeckId] = source;
		}
		if (targetLoaded) {
			decksCards[deckId][p.rowId] = {
				scryfallId: before.scryfallId,
				entry: { ...p.entry, ownerId: userId ?? undefined },
			};
		}
	}

	useCollectionStore.setState({ entries: nextCollection });
	const deck = deckState.decks[deckId];
	useDeckStore.setState({
		decksCards,
		...(deck
			? {
					decks: { ...deckState.decks, [deckId]: { ...deck, updatedAt: new Date().toISOString() } },
				}
			: {}),
	});

	if (userId && rows.length > 0) {
		enqueue({ type: BULK_UPDATE, payload: { rows } });
		triggerSync();
	}
}
