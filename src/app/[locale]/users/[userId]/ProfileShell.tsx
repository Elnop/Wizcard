'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { useProfileByNickname } from './useProfileByNickname';
import { useProfileSummary } from './useProfileSummary';
import { ProfileShellProvider } from './ProfileShellContext';
import { ProfileView } from './components/ProfileView';
import { UserNotFound } from './components/UserNotFound';

/**
 * Shell for every `/users/<nickname>/...` route. Resolves the nickname to a
 * profile ONCE, handles loading / not-found, computes ownership, and renders the
 * ProfileView shell (header + tab links) with the active tab's page as
 * `children`. The resolved identity is published via ProfileShellContext so the
 * tab sub-pages don't each re-resolve the nickname. The owner sees their live
 * profile (from ProfileContext); visitors see the read-only public profile.
 * Profile editing lives in /settings (reachable from the profile menu), not on
 * this page. Not auth-gated — public sharing is enforced by RLS.
 */
export default function ProfileShell({ children }: { children: React.ReactNode }) {
	const params = useParams();
	const nickname = params.userId as string;
	const { user } = useAuth();

	const { profile: resolved, status } = useProfileByNickname(nickname);
	const ownerCtx = useProfileContext();
	const summary = useProfileSummary(resolved?.id ?? '');

	if (status === 'loading') {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
				<Spinner />
			</div>
		);
	}
	if (status === 'not-found' || !resolved) {
		return <UserNotFound />;
	}

	const isOwner = !!user && user.id === resolved.id;
	// The owner's live profile (reflects unsaved edits) comes from context; a
	// visitor sees the resolved public profile.
	const profile = isOwner ? ownerCtx.profile : resolved;

	return (
		<ProfileShellProvider
			value={{ ownerId: resolved.id, isOwner, handle: nickname, summary, profile }}
		>
			{/* `resolved.id` (the real id) keys the summary/count queries; `handle`
			    (the URL nickname) builds the tab hrefs — they are deliberately distinct. */}
			<ProfileView
				profile={profile}
				isLoading={isOwner ? ownerCtx.isLoading : false}
				handle={nickname}
				summary={summary}
			>
				{children}
			</ProfileView>
		</ProfileShellProvider>
	);
}
