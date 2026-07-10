import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/profile/types';

/**
 * Server-side profile lookup by nickname for generateMetadata / OG / sitemap.
 * The /users/[userId] route param carries the nickname. Profiles are public
 * (RLS SELECT to anon).
 */
export async function fetchProfileByNickname(nickname: string): Promise<Profile | null> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('id, nickname, description, avatar_url, created_at, updated_at')
		.eq('nickname', nickname)
		.maybeSingle();
	if (error || !data) return null;
	return {
		id: data.id as string,
		nickname: (data.nickname ?? null) as string | null,
		description: (data.description ?? null) as string | null,
		avatarUrl: (data.avatar_url ?? null) as string | null,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string,
	};
}
