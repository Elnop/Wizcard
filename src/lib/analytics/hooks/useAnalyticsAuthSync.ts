'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useAnalytics } from '../context/AnalyticsContext';

// Bridges Supabase auth state to analytics identity. Mounted INSIDE the auth
// tree (it needs useAuth); the AnalyticsProvider itself sits above AuthProvider.
// Tracks the previous user id so we only identify/reset on real transitions.
export function useAnalyticsAuthSync(): void {
	const { user, isLoading } = useAuth();
	const analytics = useAnalytics();
	const prevUserId = useRef<string | null>(null);

	useEffect(() => {
		if (isLoading) return;
		const currentId = user?.id ?? null;
		if (currentId === prevUserId.current) return;

		if (currentId) {
			analytics.identify(currentId);
		} else if (prevUserId.current) {
			// Was signed in, now signed out.
			analytics.reset();
		}
		prevUserId.current = currentId;
	}, [user, isLoading, analytics]);
}
