'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { useProfileByNickname } from './useProfileByNickname';
import { ProfileView } from './components/ProfileView';
import { ProfileEditModal } from './components/ProfileEditModal';
import { UserNotFound } from './components/UserNotFound';

/**
 * Canonical, shareable profile URL keyed by nickname (`/users/<nickname>`). The
 * nickname is resolved to a profile; the owner sees their own live profile (from
 * ProfileContext) plus an Edit button, visitors see the read-only public profile.
 */
export default function ProfilePage() {
	const params = useParams();
	const nickname = params.userId as string;
	const { user } = useAuth();
	const [editing, setEditing] = useState(false);

	const { profile: resolved, status } = useProfileByNickname(nickname);
	const ownerCtx = useProfileContext();

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
		<>
			<ProfileView
				userId={resolved.id}
				profile={profile}
				isLoading={isOwner ? ownerCtx.isLoading : false}
				isOwner={isOwner}
				onEdit={isOwner ? () => setEditing(true) : undefined}
			/>
			{editing && <ProfileEditModal onClose={() => setEditing(false)} />}
		</>
	);
}
