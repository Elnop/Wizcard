import { createClient } from '@/lib/supabase/client';

export type ProfileSearchResult = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
};

const PAGE = 24;

/** Search public profiles by nickname (RLS already restricts to is_public). */
export async function searchProfiles(
	term: string,
	opts: { limit?: number; offset?: number } = {}
): Promise<{ profiles: ProfileSearchResult[]; total: number }> {
	const limit = opts.limit ?? PAGE;
	const offset = opts.offset ?? 0;
	const supabase = createClient();
	let q = supabase
		.from('profiles')
		.select('id, nickname, description, avatar_url', { count: 'exact' });
	if (term.trim()) q = q.ilike('nickname', `%${term.trim()}%`);
	q = q.not('nickname', 'is', null).order('nickname', { ascending: true });
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
