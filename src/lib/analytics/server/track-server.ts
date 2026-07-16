import type { AnalyticsEvent } from '../analytics-events';
import { createServerClient } from '../providers/posthog-server';

// Emit a business event from a Server Action / route handler. No-op when no key
// is configured. Never throws — analytics must not break a server request.
// When distinctId is omitted, a throwaway anonymous id is used — the event is
// counted but never linked to a person (used when no PostHog cookie is present).
export async function trackServer(event: AnalyticsEvent, distinctId?: string): Promise<void> {
	const client = createServerClient();
	if (!client) return;
	try {
		client.capture({
			distinctId: distinctId ?? crypto.randomUUID(),
			event: event.name,
			properties: event.props,
		});
		await client.shutdown();
	} catch (error) {
		if (process.env.NODE_ENV === 'development') {
			console.debug('[analytics] server track failed', error);
		}
	}
}

// Extracts the PostHog browser distinct_id from the request Cookie header, so a
// server-emitted event can be attributed to the same person the browser is. The
// cookie is named `ph_phc_<token>_posthog` and its value is URL-encoded JSON
// containing `distinct_id`. Returns undefined when absent/unreadable (e.g. the
// user hasn't consented → PostHog is in-memory, no cookie). Never throws.
export function getPosthogDistinctId(cookieHeader: string | null): string | undefined {
	if (!cookieHeader) return undefined;
	const match = cookieHeader.match(/ph_phc_.*?_posthog=([^;]+)/);
	if (!match) return undefined;
	try {
		const parsed = JSON.parse(decodeURIComponent(match[1]));
		const id = parsed?.distinct_id;
		return typeof id === 'string' && id.length > 0 ? id : undefined;
	} catch {
		return undefined;
	}
}

// Capture a server-side exception (Server Actions, route handlers, RSC render).
// Anonymous distinctId 'server' — we do NOT read the PostHog cookie or Supabase
// user (consistent with anonymous-until-consent). Never throws.
export async function captureServerException(error: Error): Promise<void> {
	const client = createServerClient();
	if (!client) return;
	try {
		client.captureException(error, 'server');
		await client.shutdown();
	} catch (e) {
		if (process.env.NODE_ENV === 'development') {
			console.debug('[analytics] server captureException failed', e);
		}
	}
}
