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

export const SLOW_GAP_MS = 550; // > 500ms cap, with margin (~1.8 req/s)
// > 100ms cap, with margin (~8 req/s). Deliberately not 110ms: with several
// requests in flight, a 110ms gap lets a sliding 1s window catch exactly 10
// starts — the hard cap, with zero margin. A 429 costs 30s of blocked access,
// so we trade ~10% throughput for headroom.
export const FAST_GAP_MS = 125;

// Scryfall's limits are a RATE ("10/second"), not a concurrency cap — nothing in
// the docs requires one request in flight at a time. Spacing request STARTS by
// the gap already honours the rate; serializing start-to-END on top of it also
// pays the round-trip latency per request (~200ms), which capped us at ~3 req/s
// out of the 10 allowed and made localized card images crawl in.
//
// Allowing a few requests in flight decouples throughput from latency while the
// gap keeps the rate under the cap. Kept at 1 by default so Node ingestion (which
// shares this module) is unchanged; the browser opts in.
const DEFAULT_MAX_IN_FLIGHT = 1;

function isSlowUrl(url: string): boolean {
	let path: string;
	try {
		path = new URL(url).pathname;
	} catch {
		return true; // unknown shape → be conservative (slow)
	}
	return SLOW_PATHS.test(path);
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
	/**
	 * Requests allowed in flight at once on the FAST tier (10/s endpoints). The
	 * gap still paces their starts, so the rate stays under the cap; this only
	 * stops throughput from being throttled by round-trip latency. Slow-tier
	 * endpoints (2/s) stay strictly serialized regardless.
	 */
	maxInFlight?: number;
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
	const maxInFlight = Math.max(1, opts.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT);

	// Gate: callers queue here to claim a start slot. Holding it only while
	// *scheduling* (not for the whole request) is what lets several fast requests
	// be in flight at once while their starts stay `gap` apart.
	let gate: Promise<void> = Promise.resolve();
	// Timestamp of the last request START (not end): the gap paces starts, which
	// is what Scryfall's "10/second" actually constrains.
	let lastRequestStartMs = 0;
	// Remaining requests over which the post-429 penalty still applies.
	let penaltyRemaining = 0;
	// Fast-tier requests currently in flight, and callers waiting for a slot.
	let inFlight = 0;
	const waiters: Array<() => void> = [];

	function releaseSlot(): void {
		inFlight--;
		waiters.shift()?.();
	}

	// Wait for a free in-flight slot. After a 429 we collapse to one request at a
	// time until the penalty decays, so we back off rather than re-saturate.
	async function acquireSlot(limit: number): Promise<void> {
		const effectiveLimit = penaltyRemaining > 0 ? 1 : limit;
		while (inFlight >= effectiveLimit) {
			await new Promise<void>((resolve) => waiters.push(resolve));
		}
		inFlight++;
	}

	function baseGapFor(url: string): number {
		return isSlowUrl(url) ? slowGap : fastGap;
	}

	function currentGap(url: string): number {
		const base = baseGapFor(url);
		return penaltyRemaining > 0 ? base * PENALTY_FACTOR : base;
	}

	// Executes a single HTTP attempt with an abort timer and caller-signal forwarding.
	// Returns the Response or throws. Does NOT handle 429 or retry logic.
	async function fetchOnce(url: string, init?: RequestInit): Promise<Response> {
		// Use an explicit AbortController + clearTimeout rather than AbortSignal.timeout:
		// the latter leaves a live 30s libuv timer dangling on EVERY request until it
		// fires, leaking native RSS across a long run of 100k+ requests.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
		const onCallerAbort = (): void => controller.abort(init?.signal?.reason);
		if (init?.signal) init.signal.addEventListener('abort', onCallerAbort, { once: true });
		try {
			return await fetch(url, {
				...init,
				headers: { 'User-Agent': userAgent, ...init?.headers },
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timer);
			init?.signal?.removeEventListener('abort', onCallerAbort);
		}
	}

	async function handle429(
		res: Response,
		lastResponse: Response | null,
		attempt: number,
		url: string,
		init?: RequestInit
	): Promise<void> {
		// Drain the previous 429 body: an unread Response keeps undici holding the
		// socket/buffer, leaking native RSS across a long run of retries.
		await lastResponse?.body?.cancel();
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

	async function doFetch(url: string, init?: RequestInit): Promise<Response> {
		let lastResponse: Response | null = null;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			let res: Response;
			try {
				res = await fetchOnce(url, init);
			} catch (err) {
				// A caller-initiated abort is intentional — propagate it, don't retry.
				if (init?.signal?.aborted) throw err;
				const msg = err instanceof Error ? err.message : String(err);
				if (attempt < maxRetries - 1) {
					// In the browser, Scryfall 429s arrive as TypeError (CORS blocks the
					// error response body). Treat network errors on slow endpoints as
					// likely 429s and engage the penalty so queued requests back off.
					if (typeof window !== 'undefined' && isSlowUrl(url)) {
						penaltyRemaining = PENALTY_DECAY_REQUESTS;
					}
					const wait = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
					console.warn(`  ⚠ Scryfall network error, retrying in ${wait}ms… (${msg})`);
					await sleep(wait);
					continue;
				}
				throw err;
			}

			if (res.status !== 429) return res;

			await handle429(res, lastResponse, attempt, url, init);
			lastResponse = res;
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
		// An already-aborted request must not consume a spacing slot — reject
		// before queueing so live requests behind it aren't delayed.
		if (init?.signal?.aborted) {
			return Promise.reject(init.signal.reason);
		}

		// Slow endpoints (2/s) stay strictly serialized: one in flight, so the next
		// request only starts once the previous finished. Fast ones (10/s) may
		// overlap up to maxInFlight while the gap keeps their starts paced.
		const limit = isSlowUrl(url) ? 1 : maxInFlight;

		// Queue on the gate to claim a start slot, in FIFO order.
		let openGate!: () => void;
		const claimed = new Promise<void>((resolve) => {
			openGate = resolve;
		});
		const previousGate = gate;
		gate = gate.then(() => claimed);
		await previousGate;

		try {
			await acquireSlot(limit);
			// Pace request STARTS by the gap — this is what bounds the rate.
			const sinceLastStart = Date.now() - lastRequestStartMs;
			const needed = currentGap(url);
			if (sinceLastStart < needed) {
				await sleep(needed - sinceLastStart);
			}
			lastRequestStartMs = Date.now();
		} finally {
			// Release the gate as soon as this request has STARTED: the next caller
			// can be scheduled while ours is still in flight. On the slow tier the
			// in-flight limit of 1 keeps the old serialized behaviour anyway.
			openGate();
		}

		try {
			return await doFetch(url, init);
		} finally {
			if (penaltyRemaining > 0) penaltyRemaining--;
			releaseSlot();
		}
	}

	return { fetch: throttledFetch };
}

// Shared throttle instance for ALL Scryfall traffic (browser + Node). One
// instance = one queue and one shared 429 penalty.
//
// In the browser, card grids (collection, decks, wishlist, search) resolve one
// localized print per card; serializing those made images trickle in. We allow a
// few in flight there — the gap still caps the rate — while Node ingestion keeps
// the strictly serialized behaviour it was tuned for.
const BROWSER_MAX_IN_FLIGHT = 6;

export const sharedScryfallThrottle = createScryfallThrottle(
	typeof window !== 'undefined' ? { maxInFlight: BROWSER_MAX_IN_FLIGHT } : {}
);
