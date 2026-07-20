import { createClient } from '@/lib/supabase/client';
import type { DeckMeta, DeckSource } from '@/types/decks';
import type { DeckSearchFilters } from '@/lib/search/types';
import { COMMANDER_FORMATS } from '@/lib/search/types';

export type DeckSearchResult = {
	deck: DeckMeta;
	authorNickname: string | null;
	authorAvatarUrl: string | null;
};

const PAGE = 24;

type ProfileMini = { id: string; nickname: string | null; avatar_url: string | null };

/** Resolve owner_ids whose profile nickname matches the given term. */
async function resolveAuthorIds(nickname: string): Promise<string[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('id')
		.ilike('nickname', `%${nickname.trim()}%`);
	if (error) throw new Error(`[searchDecks/author] ${error.message}`);
	return (data ?? []).map((r) => r.id as string);
}

/**
 * Resolve deck_ids that contain a card whose scryfall_id matches `scryfallId`,
 * optionally only in the commander zone (zone stored in cards.tags as
 * "deck:commander").
 */
async function resolveDeckIdsWithCard(
	scryfallId: string,
	commanderOnly: boolean
): Promise<string[]> {
	const supabase = createClient();
	let q = supabase.from('cards').select('deck_id').eq('scryfall_id', scryfallId);
	q = q.not('deck_id', 'is', null);
	if (commanderOnly) q = q.contains('tags', ['deck:commander']);
	const { data, error } = await q;
	if (error) throw new Error(`[searchDecks/card] ${error.message}`);
	return Array.from(new Set((data ?? []).map((r) => r.deck_id as string).filter(Boolean)));
}

/** Batch-fetch profiles by id and return a Map keyed by profile id. */
async function resolveAuthorsById(ownerIds: string[]): Promise<Map<string, ProfileMini>> {
	const map = new Map<string, ProfileMini>();
	if (ownerIds.length === 0) return map;
	const supabase = createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('id, nickname, avatar_url')
		.in('id', ownerIds);
	if (error) throw new Error(`[searchDecks/authors] ${error.message}`);
	for (const row of data ?? []) {
		map.set(row.id as string, row as ProfileMini);
	}
	return map;
}

function rowToResult(row: Record<string, unknown>, author: ProfileMini | null): DeckSearchResult {
	const source = (row.source === 'mtgjson' ? 'mtgjson' : 'user') as DeckSource;
	return {
		deck: {
			id: row.id as string,
			ownerId: (row.owner_id as string | null) ?? null,
			name: row.name as string,
			format: (row.format as DeckMeta['format']) ?? null,
			description: (row.description as string | null) ?? null,
			folderId: (row.folder_id as string | null) ?? null,
			coverArtUrl: (row.cover_art_url as string | null) ?? null,
			source,
			isPublic: (row.is_public as boolean | undefined) ?? true,
			createdAt: row.created_at as string,
			updatedAt: row.updated_at as string,
		},
		// Precons have no owner: the card shows a "Precon" badge instead of an author.
		authorNickname: source === 'mtgjson' ? null : (author?.nickname ?? null),
		authorAvatarUrl: source === 'mtgjson' ? null : (author?.avatar_url ?? null),
	};
}

export async function searchDecks(
	filters: DeckSearchFilters,
	opts: { limit?: number; offset?: number } = {}
): Promise<{ decks: DeckSearchResult[]; total: number }> {
	const limit = opts.limit ?? PAGE;
	const offset = opts.offset ?? 0;
	const supabase = createClient();

	// Pre-resolve author and card/commander constraints to deck_id / owner_id lists.
	let authorIds: string[] | null = null;
	if (filters.authorNickname.trim()) {
		authorIds = await resolveAuthorIds(filters.authorNickname);
		if (authorIds.length === 0) return { decks: [], total: 0 };
	}

	const commanderActive =
		filters.formats.some((f) => COMMANDER_FORMATS.includes(f)) && !!filters.commander.trim();

	let deckIdConstraint: string[] | null = null;
	// DORMANT: never reached today — cardInBoard/commander are never populated by the UI (see plan COURSE CORRECTION 2).
	if (filters.cardInBoard.trim()) {
		deckIdConstraint = await resolveDeckIdsWithCard(filters.cardInBoard.trim(), false);
	}
	// DORMANT: never reached today — cardInBoard/commander are never populated by the UI (see plan COURSE CORRECTION 2).
	if (commanderActive) {
		const cmdIds = await resolveDeckIdsWithCard(filters.commander.trim(), true);
		deckIdConstraint =
			deckIdConstraint === null ? cmdIds : deckIdConstraint.filter((id) => cmdIds.includes(id));
	}
	if (deckIdConstraint !== null && deckIdConstraint.length === 0) {
		return { decks: [], total: 0 };
	}

	// Two-step author join: decks.owner_id references auth.users, not
	// public.profiles, so there is no FK PostgREST can use to embed
	// `profiles!decks_owner_id_fkey(...)` in the decks select. Fetch decks
	// first, then batch-fetch profiles by owner_id and merge in memory.
	let q = supabase.from('decks').select('*', { count: 'exact' });
	if (filters.name.trim()) q = q.ilike('name', `%${filters.name.trim()}%`);
	if (filters.formats.length > 0) q = q.in('format', filters.formats);
	if (filters.precon === 'only') q = q.eq('source', 'mtgjson');
	if (filters.precon === 'exclude') q = q.eq('source', 'user');
	if (authorIds !== null) q = q.in('owner_id', authorIds);
	// NOTE: if this path is ever revived, a card in thousands of decks would overflow the URL —
	// switch to a server-side join / RPC instead of a client-side .in().
	if (deckIdConstraint !== null) q = q.in('id', deckIdConstraint);
	// Order by created_at, not updated_at: for a precon created_at holds the
	// product's RELEASE date (see scripts/precons/db-writer.ts), so precons sort
	// as a real catalogue instead of clumping at whatever minute the sync ran and
	// burying every user deck. User decks keep their true creation date, so one
	// made today still outranks an older precon. id breaks ties deterministically
	// — same-day releases would otherwise shuffle between pages and duplicate or
	// skip rows across the offset pagination.
	q = q.order('created_at', { ascending: false });
	q = q.order('id', { ascending: false });
	q = q.range(offset, offset + limit - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`[searchDecks] ${error.message}`);
	const rows = data ?? [];
	// Precon decks (source: 'mtgjson') have owner_id null and no author to resolve.
	const ownerIds = Array.from(
		new Set(rows.map((r) => r.owner_id as string | null).filter((id): id is string => id !== null))
	);
	const authorsById = await resolveAuthorsById(ownerIds);
	const decks = rows.map((r) => {
		const ownerId = r.owner_id as string | null;
		return rowToResult(
			r as Record<string, unknown>,
			ownerId !== null ? (authorsById.get(ownerId) ?? null) : null
		);
	});
	return { decks, total: count ?? decks.length };
}
