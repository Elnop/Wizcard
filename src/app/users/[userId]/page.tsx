'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { useProfile } from './useProfile';
import { ProfileView } from './components/ProfileView';
import { ProfileEditModal } from './components/ProfileEditModal';

/**
 * Canonical, shareable profile URL. Owner sees their own live profile (from
 * ProfileContext) plus an Edit button; visitors see the read-only public
 * profile (via useProfile). Both hooks run unconditionally since hooks can't
 * be conditional — the unused fetch for the owner case is an acceptable cost.
 */
export default function ProfilePage() {
	const params = useParams();
	const userId = params.userId as string;
	const { user } = useAuth();
	const isOwner = !!user && user.id === userId;
	const [editing, setEditing] = useState(false);

	const ownerCtx = useProfileContext();
	const visitor = useProfile(userId);
	const profile = isOwner ? ownerCtx.profile : visitor.profile;
	const isLoading = isOwner ? ownerCtx.isLoading : visitor.isLoading;

	return (
		<>
			<ProfileView
				userId={userId}
				profile={profile}
				isLoading={isLoading}
				onEdit={isOwner ? () => setEditing(true) : undefined}
			/>
			{editing && <ProfileEditModal onClose={() => setEditing(false)} />}
		</>
	);
}
