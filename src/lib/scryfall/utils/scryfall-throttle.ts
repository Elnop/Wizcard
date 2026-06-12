// Shared Scryfall throttle: serializes all Scryfall requests, enforces an
// end-to-start gap that respects Scryfall's PER-ENDPOINT limits, and absorbs
// 429s with adaptive backoff.
//
// Scryfall caps /cards/{search,named,random,collection} at 2 req/s (500ms) and
// all other methods at 10 req/s (100ms). A single uniform gap either violates
// the slow endpoints (→ 429 bursts on the fuzzy pass) or needlessly throttles
// the fast ones. We classify by URL path and pace each tier just under its cap.
//
// This is the single rate-limiting authority for ALL Scryfall traffic — browser
// (via fetcher.ts) and Node ingestion (resolver, /sets). Using one shared
// instance means every endpoint shares the same serialized queue and 429
// penalty, so nothing escapes the limiter or races it.

// Endpoints Scryfall caps at 2 req/s. Path-based; method is irrelevant
// (/cards/collection is POST, the rest GET — the path alone classifies them).
const SLOW_PATHS = /^\/cards\/(search|named|random|collection)\b/u;

export const SLOW_GAP_MS = 550; // < 500ms cap, with margin (~1.8 req/s)
export const FAST_GAP_MS = 110; // < 100ms cap, with margin (~9 req/s)

function isSlowUrl(url: string): boolean {
	let path: string;
	try {
		path = new URL(url).pathname;
	} catch {
		return true; // unknown shape → be conservative (slow)
	}
	return SLOW_PATHS.test(path);
}

export function gapForUrl(url: string): number {
	return isSlowUrl(url) ? SLOW_GAP_MS : FAST_GAP_MS;
}

// After a 429 we multiply the gap by this factor and let it decay back to the
// baseline over the following requests — prevents an immediate re-saturation.
const PENALTY_FACTOR = 2;
const PENALTY_DECAY_REQUESTS = 10;

const DEFAULT_MAX_RETRIES = 8;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
// Per-request hard timeout. Node's fetch (undici) has no default request
// timeout: a socket that connects but never responds leaves `await fetch`
// pending forever, which wedges the serialized mutex and hangs every queued
// Scryfall request behind it (and, in ingestion, the whole enrich worker). We
// abort stalled requests so they surface as a network error and get retried.
const REQUEST_TIMEOUT_MS = 30_000;

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
	slowGapMs?: number;
	fastGapMs?: number;
	maxRetries?: number;
	requestTimeoutMs?: number;
	userAgent?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createScryfallThrottle(opts: ThrottleOptions = {}): ScryfallThrottle {
	const slowGap = opts.slowGapMs ?? SLOW_GAP_MS;
	const fastGap = opts.fastGapMs ?? FAST_GAP_MS;
	const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
	const requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
	const userAgent = opts.userAgent ?? 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';

	// Serializes callers so only one request is in flight and gaps are measured
	// correctly. Each caller chains onto the previous one's release.
	let mutex: Promise<void> = Promise.resolve();
	let lastRequestEndMs = 0;
	// Remaining requests over which the post-429 penalty still applies.
	let penaltyRemaining = 0;

	function baseGapFor(url: string): number {
		return isSlowUrl(url) ? slowGap : fastGap;
	}

	function currentGap(url: string): number {
		const base = baseGapFor(url);
		return penaltyRemaining > 0 ? base * PENALTY_FACTOR : base;
	}

	async function doFetch(url: string, init?: RequestInit): Promise<Response> {
		let lastResponse: Response | null = null;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			let res: Response;
			// Abort a request that stalls past the timeout so a dead socket can't pin
			// the mutex forever. Use an explicit AbortController + clearTimeout rather
			// than AbortSignal.timeout: the latter leaves a live 30s libuv timer (and
			// the listener undici attaches to its signal) dangling on EVERY request
			// until it fires, which on a long run of 100k+ requests leaks native RSS
			// steadily (heap stays flat) until OOM. Clearing the timer on completion
			// releases the timer and signal immediately.
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
			// Forward a caller abort onto our controller without AbortSignal.any (which
			// would itself register a never-removed listener on a long-lived signal).
			const onCallerAbort = (): void => controller.abort(init?.signal?.reason);
			if (init?.signal) init.signal.addEventListener('abort', onCallerAbort, { once: true });
			try {
				res = await fetch(url, {
					...init,
					headers: { 'User-Agent': userAgent, ...init?.headers },
					signal: controller.signal,
				});
			} catch (err) {
				// A caller-initiated abort is intentional — propagate it, don't retry.
				if (init?.signal?.aborted) throw err;
				const msg = err instanceof Error ? err.message : String(err);
				if (attempt < maxRetries - 1) {
					const wait = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
					console.warn(`  ⚠ Scryfall network error, retrying in ${wait}ms… (${msg})`);
					await sleep(wait);
					continue;
				}
				throw err;
			} finally {
				clearTimeout(timer);
				init?.signal?.removeEventListener('abort', onCallerAbort);
			}

			if (res.status !== 429) return res;

			// 429 — engage the penalty so subsequent requests pace slower, then wait.
			// Drain the previous 429's body before discarding it (and we'll drain this
			// one too on the next loop): an unread Response keeps undici holding the
			// socket/buffer, which leaks native RSS across a long run of retries.
			await lastResponse?.body?.cancel();
			lastResponse = res;
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

		// All attempts exhausted — return the last 429 Response for the caller.
		return (
			lastResponse ??
			(await fetch(url, {
				...init,
				headers: { 'User-Agent': userAgent, ...init?.headers },
				signal: AbortSignal.timeout(requestTimeoutMs),
			}))
		);
	}

	async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
		// An already-aborted request must not consume a serialized spacing slot —
		// reject before queueing so live requests behind it aren't delayed.
		if (init?.signal?.aborted) {
			return Promise.reject(init.signal.reason);
		}
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
			const needed = currentGap(url);
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

// Shared throttle instance for ALL Scryfall traffic (browser + Node). One
// instance = one serialized queue and one shared 429 penalty.
export const sharedScryfallThrottle = createScryfallThrottle();
