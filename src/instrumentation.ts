import type { Instrumentation } from 'next';

// Next.js auto-loads this. onRequestError fires for uncaught server errors
// (Server Actions, route handlers, RSC render). Dynamic import keeps posthog-node
// out of the edge runtime. Distinct from proxy.ts (the Next 16 middleware).
export const onRequestError: Instrumentation.onRequestError = async (err) => {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { captureServerException } = await import('@/lib/analytics/server/track-server');
		await captureServerException(err instanceof Error ? err : new Error(String(err)));
	}
};
