'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { useAnalytics, useConsent } from '../context/AnalyticsContext';

// Bridges Supabase auth state to analytics identity. Mounted INSIDE the auth
// AND profile tree (it needs useAuth + useProfileContext); the AnalyticsProvider
// itself sits above AuthProvider.
//
// Tracks the previous user id so we only reset on a real sign-out transition,
// and tracks which (user id + profile fingerprint) we've already sent so
// identify() is never called without consent and never re-sent for identical
// traits. Because the profile hydrates asynchronously *after* auth resolves,
// this effect fires twice for a fresh login: first with email only, then again
// with nickname/language/etc. once the profile store is populated. The
// fingerprint gate lets the second, enriched call through while still deduping
// no-op re-renders.
export function useAnalyticsAuthSync(): void {
	const { user, isLoading } = useAuth();
	const { profile } = useProfileContext();
	const analytics = useAnalytics();
	const { consent } = useConsent();
	const prevUserId = useRef<string | null>(null);
	const identifiedKey = useRef<string | null>(null);

	useEffect(() => {
		if (isLoading) return;
		const currentId = user?.id ?? null;

		if (currentId === null && prevUserId.current) {
			// Was signed in, now signed out: identity must always be cleared,
			// regardless of consent state.
			analytics.reset();
			identifiedKey.current = null;
		} else if (currentId && consent === 'granted') {
			// $set — mutable person properties, refreshed on every login and
			// whenever the profile changes (email from auth; the rest from the
			// hydrated profile, which may be null on the first pass).
			const traits: Record<string, string | number | boolean> = {};
			if (user?.email) traits.email = user.email;
			if (profile?.nickname) traits.nickname = profile.nickname;
			if (profile?.language) traits.language = profile.language;
			if (profile?.priceCurrency) traits.price_currency = profile.priceCurrency;
			if (profile) {
				traits.is_public = profile.isPublic;
				traits.has_avatar = profile.avatarUrl != null;
			}

			// $set_once — immutable, written only the first time (never overwritten).
			const traitsOnce: Record<string, string | number | boolean> = {};
			if (profile?.createdAt) traitsOnce.signup_date = profile.createdAt;

			// Dedupe on (id + trait values) so the enriched second pass is sent
			// but idle re-renders are not.
			const key = `${currentId}:${JSON.stringify(traits)}:${JSON.stringify(traitsOnce)}`;
			if (identifiedKey.current !== key) {
				analytics.identify(currentId, traits, traitsOnce);
				identifiedKey.current = key;
			}
		}

		prevUserId.current = currentId;
	}, [user, profile, isLoading, analytics, consent]);
}
