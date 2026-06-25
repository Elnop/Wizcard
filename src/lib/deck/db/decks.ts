import type { CardEntry } from '@/types/cards';
import type { DeckMeta } from '@/types/decks';
import { type CardDbRow, rowToCardEntry, cardEntryToRow } from '@/lib/card/db/cardRow';
import {
	type DeckDbRow,
	fetchDeckRows,
	fetchDeckRowById,
	insertDeckRow,
	updateDeckRow,
	deleteDeckRow,
	unassignDeckCardRows,
	fetchDeckCardTagRows,
	fetchDeckCardRows,
	insertDeckCardRows,
	deleteDeckCardRowById,
	updateDeckCardRowById,
} from '@/lib/supabase/queries/decks';

function rowToDeckMeta(row: DeckDbRow): DeckMeta {
	return {
		id: row.id,
		ownerId: row.owner_id,
		name: row.name,
		format: (row.format as DeckMeta['format']) ?? null,
		description: row.description,
		folderId: row.folder_id ?? null,
		coverArtUrl: row.cover_art_url ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// --- Deck CRUD ---

export async function fetchDecks(userId: string): Promise<DeckMeta[]> {
	return (await fetchDeckRows(userId)).map(rowToDeckMeta);
}

/**
 * Fetch a deck by id WITHOUT an owner filter — used by the public read-only
 * view. Relies on the public SELECT policy. Returns null if absent.
 */
export async function fetchDeckMetaById(deckId: string): Promise<DeckMeta | null> {
	const row = await fetchDeckRowById(deckId);
	return row ? rowToDeckMeta(row) : null;
}

export async function insertDeck(userId: string, deck: DeckMeta): Promise<void> {
	await insertDeckRow({
		id: deck.id,
		owner_id: userId,
		name: deck.name,
		format: deck.format,
		description: deck.description,
		folder_id: deck.folderId ?? null,
		cover_art_url: deck.coverArtUrl ?? null,
		created_at: deck.createdAt,
		updated_at: deck.updatedAt,
	});
}

export async function updateDeckMeta(
	userId: string,
	deckId: string,
	updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl'>>
): Promise<void> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.format !== undefined) payload.format = updates.format;
	if (updates.description !== undefined) payload.description = updates.description;
	if (updates.coverArtUrl !== undefined) payload.cover_art_url = updates.coverArtUrl;
	await updateDeckRow(userId, deckId, payload);
}

export async function moveDeckToFolder(
	userId: string,
	deckId: string,
	folderId: string | null
): Promise<void> {
	await updateDeckRow(userId, deckId, {
		folder_id: folderId,
		updated_at: new Date().toISOString(),
	});
}

export async function deleteDeck(
	userId: string,
	deckId: string,
	deleteCollectionCopies = false
): Promise<void> {
	if (!deleteCollectionCopies) {
		await unassignCollectionCopiesFromDeck(deckId);
	}
	await deleteDeckRow(userId, deckId);
}

export async function unassignCollectionCopiesFromDeck(deckId: string): Promise<void> {
	// RLS scopes the underlying update to the owner, so no userId is needed here.
	await unassignDeckCardRows(deckId);
}

/** Fetch scryfall_id + tags for each card in the given decks (single query). */
export async function fetchDeckCardEntries(
	deckIds: string[]
): Promise<Record<string, Array<{ scryfallId: string; tags: string[] | null }>>> {
	const rows = await fetchDeckCardTagRows(deckIds);
	const result: Record<string, Array<{ scryfallId: string; tags: string[] | null }>> = {};
	for (const row of rows) {
		if (!result[row.deck_id]) result[row.deck_id] = [];
		result[row.deck_id].push({ scryfallId: row.scryfall_id, tags: row.tags });
	}
	return result;
}

// --- Deck card operations (cards table with deck_id) ---

export async function fetchDeckCards(
	deckId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const rows = await fetchDeckCardRows(deckId);
	return rows.map((row: CardDbRow) => ({
		scryfallId: row.scryfall_id,
		entry: rowToCardEntry(row, { includeOwnerId: true }),
	}));
}

export async function insertDeckCard(
	deckId: string,
	scryfallId: string,
	entry: CardEntry
): Promise<void> {
	await insertDeckCardRows([{ ...cardEntryToRow(scryfallId, entry), deck_id: deckId }]);
}

export async function insertDeckCards(
	deckId: string,
	cards: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (cards.length === 0) return;
	await insertDeckCardRows(
		cards.map(({ scryfallId, entry }) => ({
			...cardEntryToRow(scryfallId, entry),
			deck_id: deckId,
		}))
	);
}

export async function deleteDeckCard(rowId: string): Promise<void> {
	await deleteDeckCardRowById(rowId);
}

export async function updateDeckCard(
	rowId: string,
	updates: {
		scryfall_id?: string;
		tags?: string[];
		owner_id?: string | null;
		proxy?: boolean | null;
		is_foil?: boolean | null;
		foil_type?: string | null;
		condition?: string | null;
		language?: string | null;
		purchase_price?: string | null;
		wishlist?: boolean;
		deck_id?: string | null;
	}
): Promise<void> {
	await updateDeckCardRowById(rowId, updates);
}
