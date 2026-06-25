import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/collection` is a shortcut to the canonical shareable URL. Logged-in users are
// sent to /users/<id>/collection; anonymous users to login. The owner view
// component (collection/page.tsx) is reused by the canonical page, not this route.
export default async function CollectionLayout() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/collection`);
}
