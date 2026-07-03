import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/profile` is a shortcut to the canonical shareable URL /users/<id>.
// Anonymous visitors are sent to login.
export default async function ProfileRedirectPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}`);
}
