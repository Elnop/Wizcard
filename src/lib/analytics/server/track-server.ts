import type { AnalyticsEvent } from '../analytics-events';
import { createServerClient } from '../providers/posthog-server';

// Emit a business event from a Server Action / route handler. No-op when no key
// is configured. Never throws — analytics must not break a server request.
export async function trackServer(event: AnalyticsEvent, distinctId: string): Promise<void> {
	const client = createServerClient();
	if (!client) return;
	try {
		client.capture({ distinctId, event: event.name, properties: event.props });
		await client.shutdown();
	} catch (error) {
		if (process.env.NODE_ENV === 'development') {
			console.debug('[analytics] server track failed', error);
		}
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
