import { PostHog } from 'posthog-node';

// SOLE import of posthog-node. Server functions are ephemeral, so flush eagerly
// (flushAt: 1, flushInterval: 0) and shut down after each capture.
export function createServerClient(): PostHog | null {
	const key = process.env.POSTHOG_SERVER_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key) return null;
	return new PostHog(key, {
		host: 'https://eu.i.posthog.com',
		flushAt: 1,
		flushInterval: 0,
	});
}
