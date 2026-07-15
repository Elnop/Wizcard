import type { AnalyticsClient } from '../analytics-client';

// Active whenever NEXT_PUBLIC_POSTHOG_KEY is absent (dev, tests, opt-out builds).
// Every method is a no-op so calling code is identical whether analytics is on.
export function createNoopClient(): AnalyticsClient {
	return {
		track: () => {},
		page: () => {},
		identify: () => {},
		reset: () => {},
		setConsent: () => {},
	};
}
