'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { AnalyticsClient } from '../analytics-client';
import { createNoopClient } from '../providers/noop-client';
import { createPosthogClient } from '../providers/posthog-client';
import { getConsent, setConsentState, type ConsentState } from '../consent/consent-store';

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
	// Lazy initializer reads persisted consent synchronously during render
	// (SSR-safe: getConsent() returns 'unknown' server-side, the real value
	// client-side) instead of via setState-in-effect, which would trigger an
	// extra cascading render (react-hooks/set-state-in-effect).
	const [consent, setConsent] = useState<ConsentState>(getConsent);

	// Re-apply persisted consent to the client on mount (so a returning
	// visitor who accepted stays persistent across reloads).
	useEffect(() => {
		if (consent === 'granted') activeClient.setConsent(true);
	}, [consent]);

	const accept = () => {
		setConsentState('granted');
		setConsent('granted');
		activeClient.setConsent(true);
	};
	const refuse = () => {
		setConsentState('denied');
		setConsent('denied');
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
