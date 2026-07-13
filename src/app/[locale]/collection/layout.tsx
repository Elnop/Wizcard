import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/collection` is the owner's personal, editable collection working page. It is
// owner-only: anonymous visitors are sent to login, then the signed-in user's
// own collection (collection/page.tsx) renders directly here. The public,
// shareable view lives at /users/<nickname>/collection.
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function CollectionLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (!user) redirect({ href: '/auth/login', locale: await getLocale() });
	return <>{children}</>;
}
