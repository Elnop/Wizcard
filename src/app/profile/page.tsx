import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import { fetchNicknameById } from '@/lib/profile/db/profiles.server';

// `/profile` is a shortcut to the canonical shareable URL /users/<nickname>.
// Anonymous visitors are sent to login.
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function ProfileRedirectPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	const nickname = await fetchNicknameById(user.id);
	redirect(`/users/${nickname ?? user.id}`);
}
