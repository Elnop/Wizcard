import type { Metadata } from 'next';
import { fetchProfileByNickname } from '@/lib/profile/db/profile.server';
import UserOverviewClient from './UserOverviewClient';

interface UserPageProps {
	params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
	const { userId } = await params;
	const nickname = decodeURIComponent(userId);
	const profile = await fetchProfileByNickname(nickname);
	if (!profile) return { title: 'Profile Not Found' };
	const name = profile.nickname ?? nickname;
	const desc = profile.description?.slice(0, 160) ?? `${name}'s profile on Wizcard.`;
	return {
		title: name,
		description: desc,
		alternates: { canonical: `/users/${nickname}` },
		openGraph: { title: name, description: desc, url: `/users/${nickname}` },
	};
}

export default async function UserPage() {
	return <UserOverviewClient />;
}
