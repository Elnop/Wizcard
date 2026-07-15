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
