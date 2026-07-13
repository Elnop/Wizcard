import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import { fetchNicknameById } from '@/lib/profile/db/profiles.server';

// `/profile` is a shortcut to the canonical shareable URL /users/<nickname>.
// Anonymous visitors are sent to login.
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function ProfileRedirectPage() {
	const locale = await getLocale();
	const user = await getCurrentUser();
	if (!user) {
		redirect({ href: '/auth/login', locale });
		return;
	}
	const nickname = await fetchNicknameById(user.id);
	redirect({ href: `/users/${nickname ?? user.id}`, locale });
}
