import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (user) {
		redirect('/collection');
	}
	return <>{children}</>;
}
