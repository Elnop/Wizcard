export type CollectionAddRequest = {
	cardName: string;
	unownedRowIds: string[];
	wishlistRowIds: string[];
};

/**
 * Build the request for AddCardToCollectionModal from a card's deck copies,
 * its full set of print scryfallIds, and the user's wishlist entries.
 */
export function buildCollectionAddRequest(
	cardName: string,
	copies: ReadonlyArray<{ entry: { rowId: string; ownerId?: string | null } }>,
	oracleScryfallIds: ReadonlyArray<string>,
	wishlistEntries: ReadonlyArray<{ scryfallId: string; entry: { rowId: string } }>
): CollectionAddRequest {
	const scryfallIdSet = new Set(oracleScryfallIds);
	const unownedRowIds = copies.filter((c) => !c.entry.ownerId).map((c) => c.entry.rowId);
	const wishlistRowIds = wishlistEntries
		.filter((e) => scryfallIdSet.has(e.scryfallId))
		.map((e) => e.entry.rowId);
	return { cardName, unownedRowIds, wishlistRowIds };
}
