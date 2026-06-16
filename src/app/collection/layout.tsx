import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// `/collection` is a shortcut to the canonical shareable URL. Logged-in users are
// sent to /users/<id>/collection; anonymous users to login. The owner view
// component (collection/page.tsx) is reused by the canonical page, not this route.
export default async function CollectionLayout() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/collection`);
}
