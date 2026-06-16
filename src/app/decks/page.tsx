import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DecksPageClient from './DecksPageClient';

// Owner-only: the personal decks list is gated here (the shared decks layout is
// public so that `/decks/[id]` stays viewable by non-owners).
export default async function DecksPage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect('/auth/login');
	return <DecksPageClient />;
}
