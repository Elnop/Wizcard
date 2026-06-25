import { createClient } from '@/lib/supabase/client';
import type { CardDbRow } from '@/lib/card/db/cardRow';

/**
 * Raw Supabase access for `decks`, `deck_folders`, and deck-scoped `cards`
 * rows. ONLY place that issues these client.from(...) calls; domain mapping
 * (row <-> DeckMeta/FolderMeta/CardEntry) lives in deck/db.
 */

export type DeckDbRow = {
	id: string;
	owner_id: string;
	name: string;
	format: string | null;
	description: string | null;
	folder_id: string | null;
	cover_art_url: string | null;
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
	const { data, error } = await supabase
		.from('cards')
		.select('deck_id, scryfall_id, tags')
		.in('deck_id', deckIds);
	if (error) throw new Error(`[queries/decks] fetchDeckCardTagRows error: ${error.message}`);
	return data as Array<{ deck_id: string; scryfall_id: string; tags: string[] | null }>;
}

export async function fetchDeckCardRows(deckId: string): Promise<CardDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
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
