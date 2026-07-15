'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useAnalytics, useConsent } from '../context/AnalyticsContext';

// Bridges Supabase auth state to analytics identity. Mounted INSIDE the auth
// tree (it needs useAuth); the AnalyticsProvider itself sits above AuthProvider.
// Tracks the previous user id so we only reset on a real sign-out transition,
// and tracks which user id we've already identified so identify() is never
// called without consent and never called redundantly for the same user.
export function useAnalyticsAuthSync(): void {
	const { user, isLoading } = useAuth();
	const analytics = useAnalytics();
	const { consent } = useConsent();
	const prevUserId = useRef<string | null>(null);
	const identifiedUserId = useRef<string | null>(null);

	useEffect(() => {
		if (isLoading) return;
		const currentId = user?.id ?? null;

		if (currentId === null && prevUserId.current) {
			// Was signed in, now signed out: identity must always be cleared,
			// regardless of consent state.
			analytics.reset();
			identifiedUserId.current = null;
		} else if (currentId && consent === 'granted' && identifiedUserId.current !== currentId) {
			// Only identify once consent is granted, and only once per user
			// (this also covers the case where consent flips to 'granted'
			// after the user was already logged in).
			analytics.identify(currentId);
			identifiedUserId.current = currentId;
		}

		prevUserId.current = currentId;
	}, [user, isLoading, analytics, consent]);
}
