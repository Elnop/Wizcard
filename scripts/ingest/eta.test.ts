import { createEtaEstimator } from './eta';

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

// Clock is injected so the test is deterministic.
let now = 0;
const clock = (): number => now;

// Window 30s, total 100 cards.
const eta = createEtaEstimator(100, 30_000, clock);

// Not enough samples yet (< 5s elapsed) → null.
now = 0;
eta.record(0);
now = 2_000;
eta.record(10);
check('null before 5s of samples', eta.etaSeconds() === null);

// After 10s, 50 done → rate 5/s → 50 remaining → 10s.
now = 10_000;
eta.record(50);
check('eta after steady rate (got ' + eta.etaSeconds() + ')', eta.etaSeconds() === 10);

// Window drops samples older than 30s. Jump to 40s with 90 done.
// Oldest retained sample is the one at t=10s (50). delta = 40, dt = 30s → 1.33/s.
// remaining 10 → 10 / 1.333 = 7.5 → ceil 8.
now = 40_000;
eta.record(90);
check('eta uses sliding window (got ' + eta.etaSeconds() + ')', eta.etaSeconds() === 8);

// Done → 0.
now = 50_000;
eta.record(100);
check('eta is 0 when complete', eta.etaSeconds() === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
