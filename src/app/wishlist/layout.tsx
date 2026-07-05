import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/wishlist` is the owner's personal, editable wishlist working page. It is
// owner-only: anonymous visitors are sent to login, then the signed-in user's
// own wishlist (wishlist/page.tsx) renders directly here. The public, shareable
// view lives at /users/<nickname>/wishlist.
export default async function WishlistLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	return <>{children}</>;
}
