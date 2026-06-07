/* eslint-disable sonarjs/no-duplicate-string -- test fixtures reuse literal URLs by design */
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
	check(`fast spacing < slow rate (got ${fastDelta})`, fastDelta < 50);
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
