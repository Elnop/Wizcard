import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { fetchProfileByNickname } from '@/lib/profile/db/profile.server';
import UserOverviewClient from './UserOverviewClient';

interface UserPageProps {
	params: Promise<{ locale: Locale; userId: string }>;
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
	const { locale, userId } = await params;
	const nickname = decodeURIComponent(userId);
	const t = await getTranslations({ locale, namespace: 'seo.userProfile' });
	const profile = await fetchProfileByNickname(nickname);
	if (!profile) return { title: t('notFound') };
	const name = profile.nickname ?? nickname;
	const desc = profile.description?.slice(0, 160) ?? t('defaultDescription', { name });
	return {
		title: name,
		description: desc,
		alternates: buildAlternates(locale, `users/${encodeURIComponent(nickname)}`),
		openGraph: {
			title: name,
			description: desc,
			url: `/${locale}/users/${encodeURIComponent(nickname)}`,
		},
	};
}

export default async function UserPage() {
	return <UserOverviewClient />;
}
