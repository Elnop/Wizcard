// Shared Scryfall throttle: serializes requests, enforces an end-to-start gap
// below Scryfall's hard limit, and absorbs 429s with adaptive backoff.
//
// Scryfall's documented ceiling is ~10 req/s (100ms gap). Pacing exactly at that
// ceiling leaves no margin and gets punished with 429s under sustained bursts
// (e.g. the per-name fuzzy pass firing hundreds of GETs back-to-back). We pace
// at SCRYFALL_MIN_GAP_MS (130ms ≈ 7.7 req/s) and, after any 429, temporarily
// widen the gap so we back off instead of immediately re-saturating.

// Default minimum gap between the END of one response and the START of the next.
export const SCRYFALL_MIN_GAP_MS = 130;

// After a 429 we multiply the gap by this factor and let it decay back to the
// baseline over the following requests — prevents an immediate re-saturation.
const PENALTY_FACTOR = 2;
const PENALTY_DECAY_REQUESTS = 10;

const DEFAULT_MAX_RETRIES = 8;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;

export interface ScryfallThrottle {
	/**
	 * Fetch through the throttle. 429s are absorbed internally (honouring
	 * Retry-After, otherwise exponential backoff) and a non-429 Response is
	 * returned once obtained. Network errors are retried with backoff. If all
	 * attempts are exhausted the last Response (possibly a 429) is returned so
	 * callers can decide how to handle it.
	 */
	fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

interface ThrottleOptions {
	minGapMs?: number;
	maxRetries?: number;
	userAgent?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createScryfallThrottle(opts: ThrottleOptions = {}): ScryfallThrottle {
	const baseGapMs = opts.minGapMs ?? SCRYFALL_MIN_GAP_MS;
	const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
	const userAgent = opts.userAgent ?? 'Wizcard/1.0';

	// Serializes callers so only one request is in flight and gaps are measured
	// correctly. Each caller chains onto the previous one's release.
	let mutex: Promise<void> = Promise.resolve();
	let lastRequestEndMs = 0;
	// Remaining requests over which the post-429 penalty still applies.
	let penaltyRemaining = 0;

	function currentGap(): number {
		return penaltyRemaining > 0 ? baseGapMs * PENALTY_FACTOR : baseGapMs;
	}

	async function doFetch(url: string, init?: RequestInit): Promise<Response> {
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			let res: Response;
			try {
				res = await fetch(url, {
					...init,
					headers: { 'User-Agent': userAgent, ...init?.headers },
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (attempt < maxRetries - 1) {
					const wait = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
					console.warn(`  ⚠ Scryfall network error, retrying in ${wait}ms… (${msg})`);
					await sleep(wait);
					continue;
				}
				throw err;
			}

			if (res.status !== 429) return res;

			// 429 — engage the penalty so subsequent requests pace slower, then wait.
			penaltyRemaining = PENALTY_DECAY_REQUESTS;
			const retryAfterSec = parseInt(res.headers.get('retry-after') ?? '', 10);
			const wait = isNaN(retryAfterSec)
				? Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS)
				: (retryAfterSec + 1) * 1000;
			console.warn(
				`  ⚠ Scryfall 429 (retry-after=${retryAfterSec}s) on ${init?.method ?? 'GET'} ${url.replace('https://api.scryfall.com', '')}, waiting ${wait}ms…`
			);
			await sleep(wait);
		}

		// All attempts exhausted — one final try, returned as-is for the caller.
		return fetch(url, {
			...init,
			headers: { 'User-Agent': userAgent, ...init?.headers },
		});
	}

	async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
		// Acquire the mutex: wait for the previous caller, then hold our own slot.
		let releaseMutex!: () => void;
		const acquired = new Promise<void>((resolve) => {
			releaseMutex = resolve;
		});
		const previousMutex = mutex;
		mutex = mutex.then(() => acquired);
		await previousMutex;

		try {
			// Enforce the minimum gap since the last response ended.
			const gap = Date.now() - lastRequestEndMs;
			const needed = currentGap();
			if (gap < needed) {
				await sleep(needed - gap);
			}
			return await doFetch(url, init);
		} finally {
			lastRequestEndMs = Date.now();
			if (penaltyRemaining > 0) penaltyRemaining--;
			releaseMutex();
		}
	}

	return { fetch: throttledFetch };
}

// Shared throttle instance for all Node-side Scryfall traffic (resolver batches,
// fuzzy GETs, /sets). Using one instance means every endpoint shares the same
// gap counter and 429 penalty, so nothing escapes the limiter or races it.
export const sharedScryfallThrottle = createScryfallThrottle();
