import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/wishlist` is the owner's personal, editable wishlist working page. It is
// owner-only: anonymous visitors are sent to login, then the signed-in user's
// own wishlist (wishlist/page.tsx) renders directly here. The public, shareable
// view lives at /users/<nickname>/wishlist.
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function WishlistLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (!user) redirect({ href: '/auth/login', locale: await getLocale() });
	return <>{children}</>;
}
