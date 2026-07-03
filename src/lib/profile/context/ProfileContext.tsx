'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { enqueue } from '@/lib/supabase/sync-queue';
import { useProfileStore } from '../store/profile-store';
import type { Profile, ProfileUpdate } from '@/lib/profile/types';

type ProfileContextValue = {
	profile: Profile | null;
	isLoading: boolean;
	updateProfile: (patch: ProfileUpdate) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const userId = user?.id ?? null;

	const store = useProfileStore();
	const prevUserIdRef = useRef<string | null | undefined>(undefined);

	useEffect(() => {
		if (authLoading) return;

		const prevUserId = prevUserIdRef.current;
		prevUserIdRef.current = userId;

		if (!userId) {
			store.reset();
			return;
		}

		if (prevUserId !== undefined && prevUserId !== null && prevUserId !== userId) {
			store.reset();
		}

		void store.hydrateProfile(userId);
	}, [userId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	const updateProfile = useCallback(
		(patch: ProfileUpdate) => {
			if (!userId) return;
			store.applyProfileUpdate(patch);
			enqueue({ type: 'profile-update', payload: { userId, updates: patch } });
			triggerSync();
		},
		[store, userId, triggerSync]
	);

	const value: ProfileContextValue = {
		profile: store.profile,
		isLoading: store.isLoading,
		updateProfile,
	};

	return <ProfileContext value={value}>{children}</ProfileContext>;
}

export function useProfileContext(): ProfileContextValue {
	const ctx = useContext(ProfileContext);
	if (!ctx) throw new Error('useProfileContext must be used within a ProfileProvider');
	return ctx;
}
