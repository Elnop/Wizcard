'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/profile/types';
import { fetchProfileByNickname } from '@/lib/profile/db/profiles';

/**
 * Resolve the nickname from a `/users/<nickname>/...` URL to a profile (with the
 * real user id). `status` distinguishes the three render states the pages need:
 * still resolving, resolved, or no such user.
 */
export function useProfileByNickname(nickname: string): {
	profile: Profile | null;
	status: 'loading' | 'found' | 'not-found';
} {
	const [profile, setProfile] = useState<Profile | null>(null);
	const [status, setStatus] = useState<'loading' | 'found' | 'not-found'>('loading');

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setStatus('loading');
			setProfile(null);
			try {
				const p = await fetchProfileByNickname(nickname);
				if (cancelled) return;
				setProfile(p);
				setStatus(p ? 'found' : 'not-found');
			} catch {
				if (!cancelled) setStatus('not-found');
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [nickname]);

	return { profile, status };
}
