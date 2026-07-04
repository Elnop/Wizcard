import { createClient } from '@/lib/supabase/server';

/**
 * Server-side lookup of a user's nickname by id, used by the `/decks`,
 * `/collection`, and `/profile` shortcut routes to redirect to the canonical
 * nickname-keyed URL. Returns null if the profile or nickname is missing.
 */
export async function fetchNicknameById(userId: string): Promise<string | null> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('nickname')
		.eq('id', userId)
		.maybeSingle();
	if (error) throw error;
	return (data?.nickname as string | null) ?? null;
}
