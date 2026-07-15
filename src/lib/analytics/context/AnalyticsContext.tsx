'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { AnalyticsClient } from '../analytics-client';
import { createNoopClient } from '../providers/noop-client';
import { createPosthogClient } from '../providers/posthog-client';
import {
	getConsent,
	setConsentState,
	subscribeConsent,
	type ConsentState,
} from '../consent/consent-store';

// Module singleton: the active client is chosen once (posthog if a key exists,
// noop otherwise) and exposed both via React context (components) and via
// getAnalytics() (Zustand stores, which live outside React).
const activeClient: AnalyticsClient = process.env.NEXT_PUBLIC_POSTHOG_KEY
	? createPosthogClient()
	: createNoopClient();

export function getAnalytics(): AnalyticsClient {
	return activeClient;
}

const AnalyticsContext = createContext<AnalyticsClient>(activeClient);

type ConsentContextValue = {
	consent: ConsentState;
	accept: () => void;
	refuse: () => void;
};
const ConsentContext = createContext<ConsentContextValue | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
	// useSyncExternalStore is hydration-safe: the third argument (server
	// snapshot) is used for BOTH the server render and the client's hydration
	// render, so they match ('unknown' either way). React then re-syncs to
	// the real client value (getConsent(), reading localStorage) right after
	// hydration commits — no setState-in-effect, no mismatch.
	const consent = useSyncExternalStore<ConsentState>(subscribeConsent, getConsent, () => 'unknown');

	// Re-apply persisted consent to the client on mount/whenever it changes
	// (so a returning visitor who accepted stays persistent across reloads).
	// This only calls into the external activeClient — no React setState —
	// so react-hooks/set-state-in-effect does not apply here.
	useEffect(() => {
		if (consent === 'granted') activeClient.setConsent(true);
	}, [consent]);

	const accept = () => {
		setConsentState('granted');
		activeClient.setConsent(true);
	};
	const refuse = () => {
		setConsentState('denied');
		activeClient.setConsent(false);
	};

	return (
		<AnalyticsContext value={activeClient}>
			<ConsentContext value={{ consent, accept, refuse }}>{children}</ConsentContext>
		</AnalyticsContext>
	);
}

export function useAnalytics(): AnalyticsClient {
	return useContext(AnalyticsContext);
}

export function useConsent(): ConsentContextValue {
	const ctx = useContext(ConsentContext);
	if (!ctx) throw new Error('useConsent must be used within AnalyticsProvider');
	return ctx;
}
