import { createClient } from '@/lib/supabase/client';

export type ProfileSearchResult = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
};

const PAGE = 24;

/**
 * Search public profiles by nickname (RLS already restricts to is_public).
 * With no term, returns the default ranking: profiles ordered by their number of
 * PUBLIC decks (descending) via the `profiles_by_public_deck_count` view, so the
 * /search landing's Players section leads with the most active players instead of
 * an alphabetical list.
 */
export async function searchProfiles(
	term: string,
	opts: { limit?: number; offset?: number } = {}
): Promise<{ profiles: ProfileSearchResult[]; total: number }> {
	const limit = opts.limit ?? PAGE;
	const offset = opts.offset ?? 0;
	const supabase = createClient();
	const trimmed = term.trim();

	// No term → default ranking from the view (already ordered
	// public_deck_count DESC, nickname ASC). With a term, alphabetical nickname
	// order still makes sense for a filtered `ilike` match, so keep the table path.
	// Each branch is built as its own flat statement (not nested inside a ternary
	// initializer) to avoid deepening the Supabase builder generic past TS's
	// instantiation limit (TS2589) — see project memory `supabase_builder_ts2589`.
	if (trimmed) {
		let q = supabase
			.from('profiles')
			.select('id, nickname, description, avatar_url', { count: 'exact' });
		q = q.ilike('nickname', `%${trimmed}%`).not('nickname', 'is', null).order('nickname', {
			ascending: true,
		});
		q = q.range(offset, offset + limit - 1);

		const { data, error, count } = await q;
		if (error) throw new Error(`[searchProfiles] ${error.message}`);
		const profiles = (data ?? []).map((r) => ({
			id: r.id as string,
			nickname: r.nickname as string | null,
			description: r.description as string | null,
			avatarUrl: r.avatar_url as string | null,
		}));
		return { profiles, total: count ?? profiles.length };
	}

	// Empty term: the view is already ordered and only exposes non-null
	// nicknames, so no extra order()/not() — applying them would be redundant
	// and, for order(), would override the view's ranking.
	let q = supabase
		.from('profiles_by_public_deck_count')
		.select('id, nickname, description, avatar_url', { count: 'exact' });
	q = q.range(offset, offset + limit - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`[searchProfiles] ${error.message}`);
	const profiles = (data ?? []).map((r) => ({
		id: r.id as string,
		nickname: r.nickname as string | null,
		description: r.description as string | null,
		avatarUrl: r.avatar_url as string | null,
	}));
	return { profiles, total: count ?? profiles.length };
}

export type ProfileStats = { deckCount: number; cardCount: number };

/**
 * Batched deck + collection-card counts for a set of profile owners, in TWO
 * queries total (not per profile). Counts are computed client-side by grouping
 * the returned owner_id rows. Reads rely on the public SELECT policies, so
 * private owners simply return no rows (→ zero). cardCount is collection cards
 * only: wishlist = false and not assigned to a deck (deck_id is null).
 */
export async function fetchProfileStats(ownerIds: string[]): Promise<Record<string, ProfileStats>> {
	const result: Record<string, ProfileStats> = {};
	if (ownerIds.length === 0) return result;
	for (const id of ownerIds) result[id] = { deckCount: 0, cardCount: 0 };

	const supabase = createClient();
	const [deckRes, cardRes] = await Promise.all([
		supabase.from('decks').select('owner_id').in('owner_id', ownerIds),
		supabase
			.from('public_collection_cards')
			.select('owner_id')
			.in('owner_id', ownerIds)
			.eq('wishlist', false)
			.is('deck_id', null),
	]);

	if (!deckRes.error) {
		for (const row of deckRes.data ?? []) {
			const id = row.owner_id as string;
			if (result[id]) result[id].deckCount += 1;
		}
	}
	if (!cardRes.error) {
		for (const row of cardRes.data ?? []) {
			const id = row.owner_id as string;
			if (result[id]) result[id].cardCount += 1;
		}
	}
	return result;
}
