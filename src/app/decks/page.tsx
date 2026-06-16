import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// `/decks` is a shortcut to the canonical shareable URL /users/<id>/decks.
// Anonymous visitors are sent to login. `/decks/[id]` stays public via the
// un-gated decks layout.
export default async function DecksPage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/decks`);
}
