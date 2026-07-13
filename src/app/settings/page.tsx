import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import SettingsView from './SettingsView';

export const metadata: Metadata = {
	title: 'Paramètres',
	robots: { index: false, follow: false },
};

export default async function SettingsPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	return <SettingsView />;
}
