/**
 * Moves the copy with `rowId` to the front (the modal shows cards[0] first),
 * keeping the other copies in order. Unknown or missing rowId → same array.
 */
export function focusCopyFirst<T extends { entry: { rowId: string } }>(
	cards: T[],
	rowId: string | undefined
): T[] {
	if (!rowId) return cards;
	const index = cards.findIndex((c) => c.entry.rowId === rowId);
	if (index <= 0) return cards;
	return [cards[index], ...cards.slice(0, index), ...cards.slice(index + 1)];
}
