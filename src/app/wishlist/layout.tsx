import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import { fetchNicknameById } from '@/lib/profile/db/profiles.server';

// `/wishlist` is a shortcut to the canonical shareable URL. Logged-in users are
// sent to /users/<nickname>/wishlist; anonymous users to login. The owner view
// component (wishlist/page.tsx) is reused by the canonical page, not this route.
export default async function WishlistLayout() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	const nickname = await fetchNicknameById(user.id);
	redirect(`/users/${nickname ?? user.id}/wishlist`);
}
