import type { CardEntry } from '@/types/cards';
import type { DeckMeta } from '@/types/decks';
import { createClient } from '@/lib/supabase/client';

type DeckDbRow = {
	id: string;
	owner_id: string;
	name: string;
	format: string | null;
	description: string | null;
	folder_id: string | null;
	created_at: string;
	updated_at: string;
};

function rowToDeckMeta(row: DeckDbRow): DeckMeta {
	return {
		id: row.id,
		name: row.name,
		format: (row.format as DeckMeta['format']) ?? null,
		description: row.description,
		folderId: row.folder_id ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

type CardDbRow = {
	id: string;
	owner_id: string | null;
	scryfall_id: string;
	date_added: string;
	is_foil: boolean | null;
	foil_type: string | null;
	condition: string | null;
	language: string | null;
	purchase_price: string | null;
	for_trade: boolean | null;
	alter: boolean | null;
	proxy: boolean | null;
	tags: string[] | null;
	deck_id: string | null;
};

function rowToEntry(row: CardDbRow): CardEntry {
	return {
		rowId: row.id,
		dateAdded: row.date_added,
		isFoil: row.is_foil ?? undefined,
		foilType: (row.foil_type as CardEntry['foilType']) ?? undefined,
		condition: (row.condition as CardEntry['condition']) ?? undefined,
		language: (row.language as CardEntry['language']) ?? undefined,
		purchasePrice: row.purchase_price ?? undefined,
		forTrade: row.for_trade ?? undefined,
		alter: row.alter ?? undefined,
		proxy: row.proxy ?? undefined,
		tags: row.tags ?? undefined,
		deckId: row.deck_id ?? undefined,
	};
}

// --- Deck CRUD ---

export async function fetchDecks(userId: string): Promise<DeckMeta[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('decks')
		.select('*')
		.eq('owner_id', userId)
		.order('updated_at', { ascending: false });

	if (error) {
		throw new Error(`[decks] fetchDecks error: ${error.message}`);
	}

	return (data as DeckDbRow[]).map(rowToDeckMeta);
}

export async function fetchDeckMeta(userId: string, deckId: string): Promise<DeckMeta> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('decks')
		.select('*')
		.eq('owner_id', userId)
		.eq('id', deckId)
		.single();

	if (error) {
		throw new Error(`[decks] fetchDeckMeta error: ${error.message}`);
	}

	return rowToDeckMeta(data as DeckDbRow);
}

export async function insertDeck(userId: string, deck: DeckMeta): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('decks').insert({
		id: deck.id,
		owner_id: userId,
		name: deck.name,
		format: deck.format,
		description: deck.description,
		folder_id: deck.folderId ?? null,
		created_at: deck.createdAt,
		updated_at: deck.updatedAt,
	});

	if (error) {
		throw new Error(`[decks] insertDeck error: ${error.message}`);
	}
}

export async function updateDeckMeta(
	userId: string,
	deckId: string,
	updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>
): Promise<void> {
	const supabase = createClient();
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.format !== undefined) payload.format = updates.format;
	if (updates.description !== undefined) payload.description = updates.description;

	const { error } = await supabase
		.from('decks')
		.update(payload)
		.eq('owner_id', userId)
		.eq('id', deckId);

	if (error) {
		throw new Error(`[decks] updateDeckMeta error: ${error.message}`);
	}
}

export async function moveDeckToFolder(
	userId: string,
	deckId: string,
	folderId: string | null
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('decks')
		.update({ folder_id: folderId, updated_at: new Date().toISOString() })
		.eq('owner_id', userId)
		.eq('id', deckId);

	if (error) {
		throw new Error(`[decks] moveDeckToFolder error: ${error.message}`);
	}
}

export async function deleteDeck(userId: string, deckId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('decks').delete().eq('owner_id', userId).eq('id', deckId);

	if (error) {
		throw new Error(`[decks] deleteDeck error: ${error.message}`);
	}
}

/** Fetch distinct scryfall_ids for each of the given deck IDs in a single query. */
export async function fetchDeckScryfallIds(deckIds: string[]): Promise<Record<string, string[]>> {
	if (deckIds.length === 0) return {};
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('deck_id, scryfall_id')
		.in('deck_id', deckIds);

	if (error) {
		throw new Error(`[decks] fetchDeckScryfallIds error: ${error.message}`);
	}

	const result: Record<string, Set<string>> = {};
	for (const row of data as Array<{ deck_id: string; scryfall_id: string }>) {
		if (!result[row.deck_id]) result[row.deck_id] = new Set();
		result[row.deck_id].add(row.scryfall_id);
	}

	const out: Record<string, string[]> = {};
	for (const [deckId, ids] of Object.entries(result)) {
		out[deckId] = [...ids];
	}
	return out;
}

/** Fetch scryfall_id + tags for each card in the given decks (single query). */
export async function fetchDeckCardEntries(
	deckIds: string[]
): Promise<Record<string, Array<{ scryfallId: string; tags: string[] | null }>>> {
	if (deckIds.length === 0) return {};
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('deck_id, scryfall_id, tags')
		.in('deck_id', deckIds);

	if (error) {
		throw new Error(`[decks] fetchDeckCardEntries error: ${error.message}`);
	}

	const result: Record<string, Array<{ scryfallId: string; tags: string[] | null }>> = {};
	for (const row of data as Array<{
		deck_id: string;
		scryfall_id: string;
		tags: string[] | null;
	}>) {
		if (!result[row.deck_id]) result[row.deck_id] = [];
		result[row.deck_id].push({ scryfallId: row.scryfall_id, tags: row.tags });
	}
	return result;
}

// --- Deck card operations (cards table with deck_id) ---

export async function fetchDeckCards(
	deckId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('deck_id', deckId)
		.order('date_added', { ascending: true });

	if (error) {
		throw new Error(`[decks] fetchDeckCards error: ${error.message}`);
	}

	return (data as CardDbRow[]).map((row) => ({
		scryfallId: row.scryfall_id,
		entry: rowToEntry(row),
	}));
}

export async function insertDeckCard(
	deckId: string,
	scryfallId: string,
	entry: CardEntry
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert({
		id: entry.rowId,
		owner_id: entry.deckId && !entry.forTrade ? null : undefined,
		scryfall_id: scryfallId,
		date_added: entry.dateAdded,
		deck_id: deckId,
		is_foil: entry.isFoil ?? null,
		foil_type: entry.foilType ?? null,
		condition: entry.condition ?? null,
		language: entry.language ?? null,
		purchase_price: entry.purchasePrice ?? null,
		for_trade: entry.forTrade ?? null,
		alter: entry.alter ?? null,
		proxy: entry.proxy ?? null,
		tags: entry.tags ?? null,
	});

	if (error) {
		throw new Error(`[decks] insertDeckCard error: ${error.message}`);
	}
}

export async function insertDeckCards(
	deckId: string,
	cards: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (cards.length === 0) return;
	const supabase = createClient();
	const rows = cards.map(({ scryfallId, entry }) => ({
		id: entry.rowId,
		owner_id: entry.deckId && !entry.forTrade ? null : undefined,
		scryfall_id: scryfallId,
		date_added: entry.dateAdded,
		deck_id: deckId,
		is_foil: entry.isFoil ?? null,
		foil_type: entry.foilType ?? null,
		condition: entry.condition ?? null,
		language: entry.language ?? null,
		purchase_price: entry.purchasePrice ?? null,
		for_trade: entry.forTrade ?? null,
		alter: entry.alter ?? null,
		proxy: entry.proxy ?? null,
		tags: entry.tags ?? null,
	}));

	const { error } = await supabase.from('cards').insert(rows);

	if (error) {
		throw new Error(`[decks] insertDeckCards error: ${error.message}`);
	}
}

export async function deleteDeckCard(rowId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('id', rowId);

	if (error) {
		throw new Error(`[decks] deleteDeckCard error: ${error.message}`);
	}
}

export async function updateDeckCard(
	rowId: string,
	updates: { tags?: string[]; owner_id?: string | null }
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').update(updates).eq('id', rowId);

	if (error) {
		throw new Error(`[decks] updateDeckCard error: ${error.message}`);
	}
}
