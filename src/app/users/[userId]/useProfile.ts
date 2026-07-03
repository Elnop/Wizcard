'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/profile/types';
import { fetchProfile } from '@/lib/profile/db/profiles';

/**
 * Read-only, context-free loader for a given user's public profile. Used by
 * the public profile page. `fetchProfile` returns any user's profile under
 * the public SELECT policy.
 */
export function useProfile(userId: string): { profile: Profile | null; isLoading: boolean } {
	const [profile, setProfile] = useState<Profile | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			try {
				const p = await fetchProfile(userId);
				if (!cancelled) setProfile(p);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [userId]);

	return { profile, isLoading };
}
