export type CollectionAddRequest = {
	cardName: string;
	unownedRowIds: string[];
};

/**
 * Build the request for AddCardToCollectionModal from a card's deck copies.
 */
export function buildCollectionAddRequest(
	cardName: string,
	copies: ReadonlyArray<{ entry: { rowId: string; ownerId?: string | null } }>
): CollectionAddRequest {
	const unownedRowIds = copies.filter((c) => !c.entry.ownerId).map((c) => c.entry.rowId);
	return { cardName, unownedRowIds };
}
