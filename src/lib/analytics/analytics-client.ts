import type { AnalyticsEvent } from './analytics-events';

// The "port" — every adapter (PostHog, noop, or a future replacement)
// implements this. No file outside src/lib/analytics/providers/ may import a
// vendor SDK; consumers depend only on this interface.
export interface AnalyticsClient {
	track<E extends AnalyticsEvent>(event: E): void;
	page(url: string): void;
	identify(
		userId: string,
		traits?: Record<string, string | number | boolean>,
		traitsOnce?: Record<string, string | number | boolean>
	): void;
	reset(): void;
	setConsent(granted: boolean): void;
	captureException(error: Error, context?: Record<string, unknown>): void;
}
