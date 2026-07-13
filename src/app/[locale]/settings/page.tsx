import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import SettingsView from './SettingsView';

export const metadata: Metadata = {
	title: 'Paramètres',
	robots: { index: false, follow: false },
};

export default async function SettingsPage() {
	const user = await getCurrentUser();
	if (!user) redirect({ href: '/auth/login', locale: await getLocale() });
	return <SettingsView />;
}
