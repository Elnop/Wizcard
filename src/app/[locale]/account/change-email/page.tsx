import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import ChangeEmailView from './ChangeEmailView';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.changeEmail' });
	return { title: t('title'), robots: { index: false, follow: false } };
}

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
