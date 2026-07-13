import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/wishlist` is the owner's personal, editable wishlist working page. It is
// owner-only: anonymous visitors are sent to login, then the signed-in user's
// own wishlist (wishlist/page.tsx) renders directly here. The public, shareable
// view lives at /users/<nickname>/wishlist. Owner-only ⇒ noindex and no
// hreflang; a localized title is kept for browser-tab UX.
export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.wishlist' });
	return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function WishlistLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (!user) redirect({ href: '/auth/login', locale: await getLocale() });
	return <>{children}</>;
}
