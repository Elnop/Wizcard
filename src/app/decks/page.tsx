import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import { fetchNicknameById } from '@/lib/profile/db/profiles.server';

// `/decks` is a shortcut to the canonical shareable URL /users/<nickname>/decks.
// Anonymous visitors are sent to login. `/decks/[id]` stays public via the
// un-gated decks layout.
export default async function DecksPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	const nickname = await fetchNicknameById(user.id);
	redirect(`/users/${nickname ?? user.id}/decks`);
}
