import { fetchProfileByNickname } from '@/lib/profile/db/profile.server';
import ProfileShell from './ProfileShell';

interface UserLayoutProps {
	children: React.ReactNode;
	params: Promise<{ userId: string }>;
}

/**
 * Server wrapper for the /users/[userId] segment. Emits a crawlable, static
 * <h1> with the profile nickname BEFORE the client ProfileShell (which gates
 * its own UI behind a loading spinner). Without this, the only server-rendered
 * heading would be Suspense-streamed and invisible to no-JS crawlers. The h1 is
 * visually hidden (off-screen) — ProfileView renders the visible name heading.
 */
export default async function UserLayout({ children, params }: UserLayoutProps) {
	const { userId } = await params;
	const nickname = decodeURIComponent(userId);
	const profile = await fetchProfileByNickname(nickname);
	const heading = profile?.nickname ?? nickname;
	return (
		<>
			<h1
				style={{
					position: 'absolute',
					width: 1,
					height: 1,
					overflow: 'hidden',
					clip: 'rect(0 0 0 0)',
				}}
			>
				{heading}
			</h1>
			<ProfileShell>{children}</ProfileShell>
		</>
	);
}
