import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (user) {
		redirect({ href: '/collection', locale: await getLocale() });
	}
	return <>{children}</>;
}
