// Shared HTTP helper for the seed scripts, which run unattended on a server: a
// transient 429/5xx or a dropped connect must not kill a scheduled run.

import type { Logger } from './logger';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_ATTEMPTS = 4;
// Guards connection setup only — the timer is cleared as soon as response headers
// arrive, so streaming a multi-GB body for minutes is fine while a hung connect still
// aborts. Never size this against the body transfer.
const CONNECT_TIMEOUT_MS = 60_000;

export interface FetchRetryOptions {
	init?: RequestInit;
	/** Retries are logged as warn events so a dashboard can alert on flapping upstreams. */
	logger?: Logger;
}

/**
 * fetch with a connect timeout and exponential backoff on transient failures
 * (429, 5xx, network errors). Non-transient responses (4xx) are returned as-is for
 * the caller to check.
 */
export async function fetchWithRetry(
	url: string,
	options: FetchRetryOptions = {},
	attempt = 0
): Promise<Response> {
	const { init, logger } = options;
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
		let res: Response;
		try {
			res = await fetch(url, { ...init, signal: controller.signal });
		} finally {
			clearTimeout(timeoutId);
		}

		if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
			// Drain the body: an unread response leaks native memory (the failure mode
			// behind the ingest worker's OOM).
			await res.body?.cancel();
			const wait = 1000 * Math.pow(2, attempt);
			logger?.warn('http retry', {
				url,
				status: res.status,
				attempt: attempt + 1,
				max_attempts: MAX_ATTEMPTS,
				wait_ms: wait,
			});
			await sleep(wait);
			return fetchWithRetry(url, options, attempt + 1);
		}
		return res;
	} catch (err) {
		if (attempt < MAX_ATTEMPTS) {
			const wait = 1000 * Math.pow(2, attempt);
			logger?.warn('http retry', {
				url,
				error: (err as Error).message,
				attempt: attempt + 1,
				max_attempts: MAX_ATTEMPTS,
				wait_ms: wait,
			});
			await sleep(wait);
			return fetchWithRetry(url, options, attempt + 1);
		}
		throw err;
	}
}
