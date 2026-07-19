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
