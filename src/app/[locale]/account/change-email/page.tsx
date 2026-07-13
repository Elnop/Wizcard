import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import ChangeEmailView from './ChangeEmailView';

export const metadata: Metadata = {
	title: 'Changer d’adresse e-mail',
	robots: { index: false, follow: false },
};

export default async function ChangeEmailPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const user = await getCurrentUser();
	if (!user) redirect({ href: '/auth/login', locale: await getLocale() });
	const { token } = await searchParams;
	return <ChangeEmailView token={token ?? ''} />;
}
