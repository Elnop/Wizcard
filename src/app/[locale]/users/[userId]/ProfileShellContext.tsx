'use client';

import { createContext, useContext } from 'react';
import type { Profile } from '@/lib/profile/types';
import type { ProfileSummary } from './useProfileSummary';

/**
 * Identity of the profile being viewed, resolved ONCE by the users/[userId]
 * layout and handed to the tab sub-pages so they don't each re-resolve the
 * nickname. `handle` is the URL nickname; `ownerId` is the real user id;
 * `isOwner` is true when the signed-in user owns this profile. `summary` and
 * `profile` are lifted from the layout's single `useProfileSummary` /
 * resolution calls so sub-pages (e.g. the Overview root page) can reuse them
 * without refetching.
 */
export type ProfileShell = {
	ownerId: string;
	isOwner: boolean;
	handle: string;
	summary: ProfileSummary;
	profile: Profile | null;
};

const ProfileShellContext = createContext<ProfileShell | null>(null);

export function ProfileShellProvider({
	value,
	children,
}: {
	value: ProfileShell;
	children: React.ReactNode;
}) {
	return <ProfileShellContext.Provider value={value}>{children}</ProfileShellContext.Provider>;
}

export function useProfileShell(): ProfileShell {
	const ctx = useContext(ProfileShellContext);
	if (!ctx) throw new Error('useProfileShell must be used within a ProfileShellProvider');
	return ctx;
}
