import posthog from 'posthog-js';
import type { AnalyticsClient } from '../analytics-client';

// SOLE import of posthog-js in the codebase. Everything vendor-specific lives here.
const isDev = process.env.NODE_ENV === 'development';

function safe(fn: () => void): void {
	try {
		fn();
	} catch (error) {
		// Analytics is non-critical: a blocked/down provider must never break the app.
		if (isDev) console.debug('[analytics] call failed', error);
	}
}

// Called once from instrumentation-client.ts. No-op if key is missing (the
// caller falls back to the noop client for consumers).
export function initPosthog(): void {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key) return;
	safe(() => {
		posthog.init(key, {
			api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/tamiyo',
			ui_host: 'https://eu.posthog.com',
			persistence: 'memory', // anonymous until consent granted
			person_profiles: 'identified_only',
			capture_pageview: false, // handled manually for the App Router
			defaults: '2026-05-30',
		});
	});
}

export function createPosthogClient(): AnalyticsClient {
	return {
		track: (event) => safe(() => posthog.capture(event.name, event.props)),
		page: (url) => safe(() => posthog.capture('$pageview', { $current_url: url })),
		identify: (userId, traits) => safe(() => posthog.identify(userId, traits)),
		reset: () => safe(() => posthog.reset()),
		setConsent: (granted) =>
			safe(() => posthog.set_config({ persistence: granted ? 'localStorage+cookie' : 'memory' })),
	};
}
