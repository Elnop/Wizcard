// src/lib/collection/bulk-plans.ts
import type { CardEntry } from '@/types/cards';
import { setDeckZone, type DeckZone } from '@/types/decks';

type PlanCopy = { rowId: string; entry: CardEntry };

/**
 * A copy assigned to a deck is the deck card itself (one row): deleting it would
 * cascade it out of the deck, so it is detached (owner_id → null) instead, as
 * `clearCollection` does. Free copies are deleted.
 */
export function planCollectionRemove(copies: PlanCopy[]): {
	deleteIds: string[];
	detachIds: string[];
} {
	const deleteIds: string[] = [];
	const detachIds: string[] = [];
	for (const { rowId, entry } of copies) {
		if (entry.deckId) detachIds.push(rowId);
		else deleteIds.push(rowId);
	}
	return { deleteIds, detachIds };
}

export type AssignKind = 'free' | 'moved' | 'same';

/** New entry of each copy once attached to `deckId` in `zone`, and where it came from. */
export function planAssignToDeck(
	copies: PlanCopy[],
	deckId: string,
	zone: DeckZone
): Array<{ rowId: string; kind: AssignKind; fromDeckId?: string; entry: CardEntry }> {
	return copies.map(({ rowId, entry }) => {
		let kind: AssignKind = 'free';
		if (entry.deckId === deckId) kind = 'same';
		else if (entry.deckId) kind = 'moved';
		return {
			rowId,
			kind,
			fromDeckId: kind === 'moved' ? entry.deckId : undefined,
			entry: { ...entry, deckId, tags: setDeckZone(entry.tags, zone) },
		};
	});
}

export function summarizeAssign(plan: ReturnType<typeof planAssignToDeck>) {
	const movedByDeck = new Map<string, number>();
	let same = 0;
	for (const p of plan) {
		if (p.kind === 'same') same += 1;
		if (p.kind === 'moved' && p.fromDeckId) {
			movedByDeck.set(p.fromDeckId, (movedByDeck.get(p.fromDeckId) ?? 0) + 1);
		}
	}
	return { total: plan.length, same, movedByDeck };
}
