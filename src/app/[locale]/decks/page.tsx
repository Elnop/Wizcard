import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import DecksPageClient from './DecksPageClient';

// `/decks` is the owner's personal, editable decks list. Owner-only: anonymous
// visitors are sent to login. The guard lives here (not the layout) so that
// `/decks/[id]` stays publicly viewable via the un-gated decks layout. The
// public, shareable decks list lives at /users/<nickname>/decks.
export default async function DecksPage() {
	const user = await getCurrentUser();
	if (!user) redirect({ href: '/auth/login', locale: await getLocale() });
	return <DecksPageClient />;
}
