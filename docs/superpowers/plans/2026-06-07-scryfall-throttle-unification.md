# Scryfall Throttle Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Scryfall 429 errors in the MPC ingest fuzzy pass by making a single, endpoint-aware throttle the only rate-limiting authority shared by both browser and Node code paths.

**Architecture:** One throttle module (`scryfall-throttle.ts`) serializes all Scryfall requests, applies a per-endpoint gap parsed from the URL path (550ms for `/cards/{search,named,random,collection}`, 110ms elsewhere), and absorbs 429s with backoff. `fetcher.ts` (browser) and `scryfall-resolver.ts`/`sources.ts` (Node) all route through it. `rate-limiter.ts` is deleted. `fetcher.ts` keeps cache/in-flight-dedup/AbortSignal on top.

**Tech Stack:** TypeScript, native `fetch`, `tsx` for tests (no test framework — table-of-cases + `process.exit(1)` style, matching `src/lib/mpc/parse-filename.test.ts`).

---

## File Structure

| File                                               | Action | Responsibility                                                           |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `src/lib/scryfall/utils/scryfall-throttle.ts`      | Modify | Per-endpoint pacing + 429 handling + serialization (the single throttle) |
| `src/lib/scryfall/utils/scryfall-throttle.test.ts` | Create | Unit tests: URL classification, spacing, 429 backoff, exhaustion         |
| `src/lib/scryfall/utils/rate-limiter.ts`           | Delete | Removed — superseded by the throttle                                     |
| `src/lib/scryfall/utils/fetcher.ts`                | Modify | Route through throttle; drop own 429 layer; keep cache/dedup/abort       |
| `src/lib/mpc/scryfall-resolver.ts`                 | Modify | Extract shared `postCollection` helper; keep fuzzy negative-cache        |
| `scripts/ingest/config.ts`                         | Modify | `fuzzy` becomes opt-out (`--no-fuzzy`)                                   |

---

## Task 1: Endpoint-aware throttle

**Files:**

- Modify: `src/lib/scryfall/utils/scryfall-throttle.ts`
- Test: `src/lib/scryfall/utils/scryfall-throttle.test.ts`

The current throttle uses a single `SCRYFALL_MIN_GAP_MS = 130` for everything. We
replace the gap with a per-endpoint classifier and add `gapFor(url)`. Pacing,
mutex, and 429 handling logic stay, but `currentGap()` now takes the URL.

- [ ] **Step 1: Write the failing test**

Create `src/lib/scryfall/utils/scryfall-throttle.test.ts`. This test file mocks
global `fetch` and uses real timers with small gaps would be slow, so we assert
on the **classifier** (exported for testing) and on **observed spacing** using
recorded timestamps. Use the table-of-cases style from
`src/lib/mpc/parse-filename.test.ts`.

```ts
import { gapForUrl, SLOW_GAP_MS, FAST_GAP_MS, createScryfallThrottle } from './scryfall-throttle';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

// ── Classification ──────────────────────────────────────────────────────────
const slow = [
	'https://api.scryfall.com/cards/search?q=bolt',
	'https://api.scryfall.com/cards/named?fuzzy=bolt',
	'https://api.scryfall.com/cards/random',
	'https://api.scryfall.com/cards/collection',
];
const fast = [
	'https://api.scryfall.com/sets',
	'https://api.scryfall.com/symbology',
	'https://api.scryfall.com/cards/autocomplete?q=bo',
	'https://api.scryfall.com/cards/abc-123',
	'https://api.scryfall.com/cards/multiverse/12345',
];
for (const u of slow) check(`slow: ${u}`, gapForUrl(u) === SLOW_GAP_MS);
for (const u of fast) check(`fast: ${u}`, gapForUrl(u) === FAST_GAP_MS);

// ── Spacing (uses a throttle with tiny gaps to keep the test fast) ───────────
async function spacingTest(): Promise<void> {
	const times: number[] = [];
	const fakeFetch = async (): Promise<Response> => {
		times.push(Date.now());
		return new Response('{}', { status: 200 });
	};
	(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch;

	// minGap overrides apply to BOTH tiers proportionally via opts.
	const throttle = createScryfallThrottle({ slowGapMs: 60, fastGapMs: 20 });

	await throttle.fetch('https://api.scryfall.com/cards/named?fuzzy=a');
	await throttle.fetch('https://api.scryfall.com/cards/named?fuzzy=b');
	const slowDelta = times[1] - times[0];
	check(`slow spacing >= 60ms (got ${slowDelta})`, slowDelta >= 55);

	const t0 = times.length;
	await throttle.fetch('https://api.scryfall.com/sets');
	await throttle.fetch('https://api.scryfall.com/sets');
	const fastDelta = times[t0 + 1] - times[t0];
	check(`fast spacing >= 20ms (got ${fastDelta})`, fastDelta >= 18);
}

// ── 429 exhaustion returns the last Response (not thrown) ────────────────────
async function exhaustionTest(): Promise<void> {
	const fakeFetch = async (): Promise<Response> =>
		new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
	(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch;

	const throttle = createScryfallThrottle({ slowGapMs: 1, fastGapMs: 1, maxRetries: 2 });
	let res: Response | null = null;
	let threw = false;
	try {
		res = await throttle.fetch('https://api.scryfall.com/cards/named?fuzzy=x');
	} catch {
		threw = true;
	}
	check('429 exhaustion does not throw', !threw);
	check('429 exhaustion returns 429 Response', res?.status === 429);
}

async function main(): Promise<void> {
	await spacingTest();
	await exhaustionTest();
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}
void main();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx src/lib/scryfall/utils/scryfall-throttle.test.ts`
Expected: FAIL — `gapForUrl`, `SLOW_GAP_MS`, `FAST_GAP_MS` not exported, and
`createScryfallThrottle` does not accept `slowGapMs`/`fastGapMs`/`maxRetries`
shape used here.

- [ ] **Step 3: Rewrite the throttle with per-endpoint gaps**

Replace the entire contents of `src/lib/scryfall/utils/scryfall-throttle.ts`:

```ts
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

export function gapForUrl(url: string): number {
	let path: string;
	try {
		path = new URL(url).pathname;
	} catch {
		return SLOW_GAP_MS; // unknown shape → be conservative
	}
	return SLOW_PATHS.test(path) ? SLOW_GAP_MS : FAST_GAP_MS;
}

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
	slowGapMs?: number;
	fastGapMs?: number;
	maxRetries?: number;
	userAgent?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createScryfallThrottle(opts: ThrottleOptions = {}): ScryfallThrottle {
	const slowGap = opts.slowGapMs ?? SLOW_GAP_MS;
	const fastGap = opts.fastGapMs ?? FAST_GAP_MS;
	const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
	const userAgent = opts.userAgent ?? 'Wizcard/1.0';

	// Serializes callers so only one request is in flight and gaps are measured
	// correctly. Each caller chains onto the previous one's release.
	let mutex: Promise<void> = Promise.resolve();
	let lastRequestEndMs = 0;
	// Remaining requests over which the post-429 penalty still applies.
	let penaltyRemaining = 0;

	function baseGapFor(url: string): number {
		// Mirror gapForUrl but honour the instance overrides for tests.
		const isSlow = gapForUrl(url) === SLOW_GAP_MS;
		return isSlow ? slowGap : fastGap;
	}

	function currentGap(url: string): number {
		const base = baseGapFor(url);
		return penaltyRemaining > 0 ? base * PENALTY_FACTOR : base;
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx src/lib/scryfall/utils/scryfall-throttle.test.ts`
Expected: PASS — all classification, spacing, and exhaustion checks pass,
final line `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scryfall/utils/scryfall-throttle.ts src/lib/scryfall/utils/scryfall-throttle.test.ts
git commit -m "feat(scryfall): per-endpoint gap in unified throttle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Route fetcher through the throttle, delete rate-limiter

**Files:**

- Modify: `src/lib/scryfall/utils/fetcher.ts`
- Delete: `src/lib/scryfall/utils/rate-limiter.ts`

The browser path currently uses `scryfallQueue.enqueue(() => fetch(...))` and has
its own retry loop that treats 429 as a non-retried 4xx. We route through
`sharedScryfallThrottle.fetch` (which now absorbs 429s before fetcher sees them)
and keep cache/dedup/abort. The throttle adds the User-Agent header, so the
caller-supplied Accept header is merged via `init.headers`.

- [ ] **Step 1: Update the import in `fetcher.ts`**

Replace line 3:

```ts
import { sharedScryfallThrottle } from './scryfall-throttle';
```

(was `import { scryfallQueue } from './rate-limiter';`)

- [ ] **Step 2: Replace the GET fetch call in `scryfallGetInner`**

In `scryfallGetInner`, replace the `scryfallQueue.enqueue(...)` block (the
`const response = await scryfallQueue.enqueue(() => fetch(url, {...}), externalSignal);`
call, lines ~99-109) with:

```ts
const response = await sharedScryfallThrottle.fetch(url, {
	headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' },
	signal: combinedSignal,
});
```

The `User-Agent` is now applied by the throttle. The retry loop, cache,
`inFlight` dedup, timeout, and AbortSignal combination all stay as-is. The
existing 4xx-not-retried branch (lines ~129-134) still correctly handles any
429 that survives the throttle's exhaustion (returned as a non-ok Response →
`ScryfallApiError` with status 429 → not retried), so no change needed there.

- [ ] **Step 3: Replace the POST fetch call in `scryfallPost`**

In `scryfallPost`, replace the `scryfallQueue.enqueue(() => fetch(url, {...}))`
call (lines ~164-175) with:

```ts
const response = await sharedScryfallThrottle.fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		Accept: 'application/json;q=0.9,*/*;q=0.8',
	},
	body: JSON.stringify(body),
	signal: controller.signal,
});
```

- [ ] **Step 4: Delete `rate-limiter.ts`**

```bash
git rm src/lib/scryfall/utils/rate-limiter.ts
```

- [ ] **Step 5: Verify no residual imports**

Run: `grep -rn "rate-limiter\|scryfallQueue" src/ scripts/ --include="*.ts" --include="*.tsx"`
Expected: no output (no matches).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scryfall/utils/fetcher.ts
git commit -m "refactor(scryfall): route fetcher through unified throttle, drop rate-limiter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Extract shared `postCollection` helper in the resolver

**Files:**

- Modify: `src/lib/mpc/scryfall-resolver.ts`

`passA` (set+num keys) and `batchCollection` (name keys) both contain the same
batched POST `/cards/collection` loop (slice by `BATCH_SIZE`, fetch, parse,
warn). Extract one helper returning raw cards; each caller indexes its own way.

- [ ] **Step 1: Add the `postCollection` helper**

After the `extractEnrichment` function (around line 73), add:

```ts
// POST /cards/collection in batches of BATCH_SIZE, returning all returned raw
// cards concatenated. Shared by passA (set+num keys) and batchCollection (name
// keys); each caller indexes the raw cards its own way.
async function postCollection(
	identifiers: Record<string, string>[]
): Promise<Record<string, unknown>[]> {
	const cards: Record<string, unknown>[] = [];
	for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
		const batch = identifiers.slice(i, i + BATCH_SIZE);
		let res: Response;
		try {
			res = await scryfallFetch(`${SCRYFALL_BASE}/cards/collection`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ identifiers: batch }),
			});
		} catch (err) {
			console.warn(`  ⚠ Scryfall batch failed: ${(err as Error).message}`);
			continue;
		}
		if (!res.ok) {
			console.warn(`  ⚠ Scryfall batch HTTP ${res.status}`);
			continue;
		}
		const data = (await res.json()) as { data: Record<string, unknown>[] };
		for (const card of data.data ?? []) cards.push(card);
	}
	return cards;
}
```

- [ ] **Step 2: Rewrite `batchCollection` to use the helper**

Replace the body of `batchCollection` (the whole function, lines ~78-116) with:

```ts
// Resolve a set of identifiers via POST /cards/collection.
// Returns a map keyed by the card's lowercased oracle name → enrichment.
async function batchCollection(
	identifiers: Record<string, string>[]
): Promise<Map<string, Omit<ScryfallResolution, 'strategy'>>> {
	const result = new Map<string, Omit<ScryfallResolution, 'strategy'>>();
	const cards = await postCollection(identifiers);
	for (const card of cards) {
		if (!card['oracle_id']) continue;
		const enrichment = extractEnrichment(card);
		const fullName = normalizeForScryfall(card['name'] as string).toLowerCase();
		result.set(fullName, enrichment);
		// Also index by front face alone so filenames that only show the front
		// face of a double-faced card (e.g. "Nicol Bolas, the Ravager") match a
		// Scryfall entry keyed as "nicol bolas, the ravager // ...".
		const slashIdx = fullName.indexOf(' // ');
		if (slashIdx !== -1) {
			result.set(fullName.slice(0, slashIdx), enrichment);
		}
	}
	return result;
}
```

- [ ] **Step 3: Rewrite the batch loop in `passA` to use the helper**

In `passA`, replace the batch loop that builds `setNumToEnrichment` (lines
~155-180, from `const setNumToEnrichment = new Map...` through the closing of
the `for` loop) with:

```ts
const setNumToEnrichment = new Map<string, Omit<ScryfallResolution, 'strategy'>>();
const cards = await postCollection(identifiers);
for (const card of cards) {
	if (card['oracle_id'] && card['set'] && card['collector_number']) {
		const key = `${card['set']}/${card['collector_number']}`;
		setNumToEnrichment.set(key, extractEnrichment(card));
	}
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify behavior with a smoke run (skip-scryfall off, limit 1)**

This requires a configured `.env.local` with Supabase + Google Drive keys. If
unavailable, skip and rely on typecheck + the maintainer's manual run noted in
Task 5.

Run: `npx tsx scripts/ingest-mpc-cards.ts --limit=1`
Expected: completes; report shows `resolved` counts; **no `⚠ Scryfall 429`
warnings** in the output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mpc/scryfall-resolver.ts
git commit -m "refactor(mpc): extract shared postCollection helper in resolver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Fuzzy opt-out by default

**Files:**

- Modify: `scripts/ingest/config.ts:86-87`

- [ ] **Step 1: Flip the fuzzy default**

Replace lines 86-87 in `scripts/ingest/config.ts`:

```ts
		// fuzzy enabled by default — the 550ms gap on /cards/named makes it safe.
		// Pass --no-fuzzy to disable (e.g. fast runs where fuzzy adds nothing).
		fuzzy: !argv.includes('--no-fuzzy'),
```

(was the opt-in `fuzzy: argv.includes('--fuzzy')` with the
`// fuzzy opt-in only — avoid 429s on large sources` comment)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the flag parses both ways**

Run: `npx tsx -e "process.argv=['node','x'];import('./scripts/ingest/config.ts').then(m=>console.log('default fuzzy:',m.flags.fuzzy))"`
Expected: `default fuzzy: true`

Run: `npx tsx -e "process.argv=['node','x','--no-fuzzy'];import('./scripts/ingest/config.ts').then(m=>console.log('no-fuzzy:',m.flags.fuzzy))"`
Expected: `no-fuzzy: false`

(If config.ts calls `process.exit` on missing env, set dummy env first:
`SUPABASE_SERVICE_ROLE_KEY=x GOOGLE_DRIVE_API_KEY=x npx tsx -e "..."`)

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/config.ts
git commit -m "feat(ingest): enable fuzzy resolution by default (--no-fuzzy to disable)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the throttle tests**

Run: `npx tsx src/lib/scryfall/utils/scryfall-throttle.test.ts`
Expected: `N passed, 0 failed`.

- [ ] **Step 2: Run the existing resolver-adjacent test**

Run: `npx tsx src/lib/mpc/parse-filename.test.ts`
Expected: `N passed, 0 failed` (unchanged — sanity that nothing regressed).

- [ ] **Step 3: Full project check**

Run: `npm run check`
Expected: tsc + eslint + prettier all pass.

- [ ] **Step 4: Manual ingest smoke (maintainer, with real env)**

Run: `npx tsx scripts/ingest-mpc-cards.ts --limit=1 --report=/tmp/ingest-report.json`
Expected: completes; `/tmp/ingest-report.json` shows `flags.fuzzy: true` and
resolved counts including `by fuzzy`; **zero `⚠ Scryfall 429` lines** in stdout.

- [ ] **Step 5: Manual browser smoke (maintainer)**

Start the app (`npm run dev`), search for cards, open a card. Confirm results
load, no console errors, and search cancellation (rapid typing) still works —
verifies cache/dedup/AbortSignal survived the throttle swap.

---

## Notes for the implementer

- **No test framework.** Tests are `.test.ts` files run via `npx tsx <file>`,
  using `console.log('PASS'/'FAIL')` + `process.exit(1)`. Match
  `src/lib/mpc/parse-filename.test.ts` exactly. Do not add vitest/jest.
- **Timer-based tests** use small gaps (`slowGapMs: 60` etc.) via
  `createScryfallThrottle` options to stay fast. The shared production instance
  uses the real 550/110ms defaults.
- The `scryfallFetch` const in `scryfall-resolver.ts`
  (`= sharedScryfallThrottle.fetch`) already points at the unified throttle —
  no change needed there in Task 3.
