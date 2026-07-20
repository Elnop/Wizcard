import { createClient } from '@/lib/supabase/client';
import type { CardDbRow } from '@/lib/card/db/cardRow';

/**
 * Raw Supabase access for `decks`, `deck_folders`, and deck-scoped `cards`
 * rows. ONLY place that issues these client.from(...) calls; domain mapping
 * (row <-> DeckMeta/FolderMeta/CardEntry) lives in deck/db.
 */

export type DeckDbRow = {
	id: string;
	owner_id: string | null;
	name: string;
	format: string | null;
	description: string | null;
	folder_id: string | null;
	cover_art_url: string | null;
	source: string;
	is_public: boolean;
	created_at: string;
	updated_at: string;
};

export type FolderDbRow = {
	id: string;
	owner_id: string;
	parent_id: string | null;
	name: string;
	position: number;
	created_at: string;
	updated_at: string;
};

// --- decks table ---

export async function fetchDeckRows(userId: string): Promise<DeckDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('decks')
		.select('*')
		.eq('owner_id', userId)
		.order('updated_at', { ascending: false });
	if (error) throw new Error(`[queries/decks] fetchDeckRows error: ${error.message}`);
	return data as DeckDbRow[];
}

export async function fetchDeckRowById(deckId: string): Promise<DeckDbRow | null> {
	const supabase = createClient();
	const { data, error } = await supabase.from('decks').select('*').eq('id', deckId).maybeSingle();
	if (error) throw new Error(`[queries/decks] fetchDeckRowById error: ${error.message}`);
	return (data as DeckDbRow | null) ?? null;
}

export async function insertDeckRow(payload: Record<string, unknown>): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('decks').insert(payload);
	if (error) throw new Error(`[queries/decks] insertDeckRow error: ${error.message}`);
}

export async function updateDeckRow(
	ownerId: string,
	deckId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('decks')
		.update(payload)
		.eq('owner_id', ownerId)
		.eq('id', deckId);
	if (error) throw new Error(`[queries/decks] updateDeckRow error: ${error.message}`);
}

export async function deleteDeckRow(ownerId: string, deckId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('decks').delete().eq('owner_id', ownerId).eq('id', deckId);
	if (error) throw new Error(`[queries/decks] deleteDeckRow error: ${error.message}`);
}

// --- deck-scoped cards table ---

export async function unassignDeckCardRows(deckId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.update({ deck_id: null })
		.eq('deck_id', deckId)
		.not('owner_id', 'is', null);
	if (error) throw new Error(`[queries/decks] unassignDeckCardRows error: ${error.message}`);
}

export async function fetchDeckCardTagRows(
	deckIds: string[]
): Promise<Array<{ deck_id: string; scryfall_id: string; tags: string[] | null }>> {
	if (deckIds.length === 0) return [];
	const supabase = createClient();
	type TagRow = { deck_id: string; scryfall_id: string; tags: string[] | null };
	const rows: TagRow[] = [];

	// MUST paginate. PostgREST caps a response at max_rows (1000, see
	// supabase/config.toml) and truncates SILENTLY — no error, no indication.
	// The deck list asks for every card of every visible deck at once, so as
	// infinite scroll grows the list past ~1000 cards total, an arbitrary subset
	// of decks came back with no cards and lost their cover art. Which decks were
	// dropped shifted per request, so covers appeared and then vanished at random
	// as the caller replaced its whole summary state.
	const PAGE = 1000;
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await supabase
			.from('cards')
			.select('deck_id, scryfall_id, tags')
			.in('deck_id', deckIds)
			.range(offset, offset + PAGE - 1);
		if (error) throw new Error(`[queries/decks] fetchDeckCardTagRows error: ${error.message}`);
		const page = (data ?? []) as TagRow[];
		rows.push(...page);
		if (page.length < PAGE) break;
	}
	return rows;
}

export async function fetchDeckCardRows(deckId: string): Promise<CardDbRow[]> {
	const supabase = createClient();
	// Explicit column list (omits purchase_price): anon has no table-level
	// SELECT on cards, only a column grant on these. purchase_price is never
	// displayed on the deck path, only written. See migration
	// 20260710120000_fix_purchase_price_leak.sql.
	const { data, error } = await supabase
		.from('cards')
		.select(
			'id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition, language, alter, proxy, tags, for_trade, deck_id, wishlist'
		)
		.eq('deck_id', deckId)
		.order('date_added', { ascending: true });
	if (error) throw new Error(`[queries/decks] fetchDeckCardRows error: ${error.message}`);
	return data as CardDbRow[];
}

export async function insertDeckCardRows(rows: Record<string, unknown>[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert(rows);
	if (error) throw new Error(`[queries/decks] insertDeckCardRows error: ${error.message}`);
}

export async function deleteDeckCardRowById(rowId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('id', rowId);
	if (error) throw new Error(`[queries/decks] deleteDeckCardRowById error: ${error.message}`);
}

export async function updateDeckCardRowById(
	rowId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').update(payload).eq('id', rowId);
	if (error) throw new Error(`[queries/decks] updateDeckCardRowById error: ${error.message}`);
}

// --- deck_folders table ---

export async function fetchFolderRows(userId: string): Promise<FolderDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('deck_folders')
		.select('*')
		.eq('owner_id', userId)
		.order('position', { ascending: true });
	if (error) throw new Error(`[queries/decks] fetchFolderRows error: ${error.message}`);
	return data as FolderDbRow[];
}

export async function insertFolderRow(payload: Record<string, unknown>): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('deck_folders').insert(payload);
	if (error) throw new Error(`[queries/decks] insertFolderRow error: ${error.message}`);
}

export async function updateFolderRow(
	ownerId: string,
	folderId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('deck_folders')
		.update(payload)
		.eq('owner_id', ownerId)
		.eq('id', folderId);
	if (error) throw new Error(`[queries/decks] updateFolderRow error: ${error.message}`);
}

export async function deleteFolderRow(ownerId: string, folderId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('deck_folders')
		.delete()
		.eq('owner_id', ownerId)
		.eq('id', folderId);
	if (error) throw new Error(`[queries/decks] deleteFolderRow error: ${error.message}`);
}
