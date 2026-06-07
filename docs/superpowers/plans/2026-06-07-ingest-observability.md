# Ingest Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MPC ingest's ad-hoc `console.log/warn` calls with a single logger module that emits standardized logfmt events on stdout (machine-readable) and a live multi-bar progress view on stderr (human), plus a clean final recap, exact global ETA via Phase-0 pre-listing, and a `--log-level` flag.

**Architecture:** A new `scripts/ingest/logger.ts` is the sole owner of all output. It exposes `event/warn/error` (logfmt → stdout) and a `progress` object (multi-bar → stderr, ANSI). Every other ingest file routes through it — no direct `console.*` survives. The entrypoint splits ingestion into Phase 0 (list all sources' Drive folders, compute exact global card total) and Phase 1 (process, reusing listings).

**Tech Stack:** TypeScript, `tsx` runner, `p-limit`. No test framework — tests are hand-rolled `check(label, cond)` scripts run via `npx tsx <file>.test.ts` (matching `src/lib/mpc/parse-filename.test.ts` and `src/lib/scryfall/utils/scryfall-throttle.test.ts`).

---

## Background for the implementer

**This codebase has no test runner.** Existing tests are standalone `.ts` files that:

- define a `check(label: string, cond: boolean)` helper incrementing module-level `passed`/`failed`,
- print `PASS:`/`FAIL:` lines,
- end with `console.log(\`\n${passed} passed, ${failed} failed\`); if (failed > 0) process.exit(1);`,
- are run with `npx tsx path/to/file.test.ts`.

Follow that exact pattern. Do **not** add vitest/jest.

**Ingest is run** with `npx tsx scripts/ingest-mpc-cards.ts [flags]`. Existing flags live in `scripts/ingest/config.ts`.

**Key constraint:** `logger.ts` is the ONLY file allowed to write ANSI escape codes or call `process.stdout/stderr.write`. All other files call logger functions.

---

## File Structure

| File                                       | Responsibility                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/ingest/logfmt.ts` (create)        | Pure logfmt serialization: turn `{key: value}` into a `key=value …` string with correct quoting. No I/O. Independently testable.                                                      |
| `scripts/ingest/logfmt.test.ts` (create)   | Tests for logfmt serialization.                                                                                                                                                       |
| `scripts/ingest/eta.ts` (create)           | Pure sliding-window ETA estimator. No I/O, no time side effects (clock injected). Independently testable.                                                                             |
| `scripts/ingest/eta.test.ts` (create)      | Tests for the ETA estimator.                                                                                                                                                          |
| `scripts/ingest/logger.ts` (create)        | The logger: `event/warn/error` (logfmt→stdout via `logfmt.ts`), `progress` multi-bar (stderr ANSI, uses `eta.ts`), level filtering, TTY detection, final recap. Sole owner of output. |
| `scripts/ingest/config.ts` (modify)        | Add `logLevel` flag parsing.                                                                                                                                                          |
| `scripts/ingest/types.ts` (modify)         | Add `LogLevel` type; keep report types.                                                                                                                                               |
| `scripts/ingest/drive-client.ts` (modify)  | Replace its 1 `console.warn` (retry notice) with `logger.warn`.                                                                                                                       |
| `scripts/ingest/db-writer.ts` (modify)     | Replace its `console.log/warn` calls with logger calls.                                                                                                                               |
| `scripts/ingest/ingest-source.ts` (modify) | Accept pre-listed files; emit `source.start/progress/done`, `card.*` events; drive `progress.task*`; remove `console.*` and the local `logScryfallStats`.                             |
| `scripts/ingest-mpc-cards.ts` (modify)     | Phase 0 pre-listing + global total; `run.start/done`; final recap via logger; remove the raw JSON dump to stdout.                                                                     |

---

## Task 1: logfmt serializer

**Files:**

- Create: `scripts/ingest/logfmt.ts`
- Test: `scripts/ingest/logfmt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ingest/logfmt.test.ts`:

```ts
import { toLogfmt } from './logfmt';

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

check(
	'plain values unquoted',
	toLogfmt({ source: 'mpcfill:foo', idx: 3 }) === 'source=mpcfill:foo idx=3'
);

check(
	'value with space is quoted',
	toLogfmt({ reason: 'HTTP 503 timeout' }) === 'reason="HTTP 503 timeout"'
);

check('value with equals is quoted', toLogfmt({ q: 'a=b' }) === 'q="a=b"');

check(
	'booleans render true/false',
	toLogfmt({ fuzzy: true, skip: false }) === 'fuzzy=true skip=false'
);

check('numbers render bare', toLogfmt({ eta_s: 63 }) === 'eta_s=63');

check(
	'inner double-quotes are escaped',
	toLogfmt({ reason: 'said "hi"' }) === 'reason="said \\"hi\\""'
);

check('null and undefined fields are skipped', toLogfmt({ a: 1, b: null, c: undefined }) === 'a=1');

check('empty string is quoted', toLogfmt({ s: '' }) === 's=""');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/ingest/logfmt.test.ts`
Expected: FAIL — `Cannot find module './logfmt'` (or all checks fail).

- [ ] **Step 3: Write the implementation**

Create `scripts/ingest/logfmt.ts`:

```ts
// Pure logfmt serialization. Turns a flat field object into a `key=value …`
// string. Values without spaces/equals/quotes render bare; otherwise they are
// double-quoted with inner quotes escaped. null/undefined fields are dropped.
// No I/O — this is the machine-format primitive used by logger.ts.

export type LogfmtValue = string | number | boolean | null | undefined;
export type LogfmtFields = Record<string, LogfmtValue>;

function needsQuoting(s: string): boolean {
	return s === '' || /[\s="]/u.test(s);
}

function formatValue(v: string | number | boolean): string {
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (!needsQuoting(v)) return v;
	const escaped = v.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
	return `"${escaped}"`;
}

export function toLogfmt(fields: LogfmtFields): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (value === null || value === undefined) continue;
		parts.push(`${key}=${formatValue(value)}`);
	}
	return parts.join(' ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/ingest/logfmt.test.ts`
Expected: `8 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/logfmt.ts scripts/ingest/logfmt.test.ts
git commit -m "feat(ingest): logfmt serializer for machine-readable logs"
```

---

## Task 2: sliding-window ETA estimator

**Files:**

- Create: `scripts/ingest/eta.ts`
- Test: `scripts/ingest/eta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ingest/eta.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/ingest/eta.test.ts`
Expected: FAIL — `Cannot find module './eta'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/ingest/eta.ts`:

```ts
// Pure sliding-window ETA estimator over a known total. Records (timestamp,
// cumulativeDone) samples, prunes samples older than the window, and estimates
// remaining seconds from the recent throughput. The clock is injectable so the
// logic is testable without real time. No I/O.

type Clock = () => number;

interface Sample {
	t: number;
	done: number;
}

export interface EtaEstimator {
	record(cumulativeDone: number): void;
	etaSeconds(): number | null;
}

const MIN_SAMPLE_SPAN_MS = 5_000;

export function createEtaEstimator(
	total: number,
	windowMs: number,
	clock: Clock = () => Date.now()
): EtaEstimator {
	const samples: Sample[] = [];

	function prune(now: number): void {
		const cutoff = now - windowMs;
		// Keep at least one sample older than the cutoff so the span covers the
		// whole window; drop everything before the last such sample.
		let firstToKeep = 0;
		for (let i = 0; i < samples.length; i++) {
			if (samples[i].t < cutoff) firstToKeep = i;
			else break;
		}
		if (firstToKeep > 0) samples.splice(0, firstToKeep);
	}

	return {
		record(cumulativeDone: number): void {
			const now = clock();
			samples.push({ t: now, done: cumulativeDone });
			prune(now);
		},
		etaSeconds(): number | null {
			if (samples.length < 2) return null;
			const first = samples[0];
			const last = samples[samples.length - 1];
			const dtMs = last.t - first.t;
			if (dtMs < MIN_SAMPLE_SPAN_MS) return null;
			const remaining = total - last.done;
			if (remaining <= 0) return 0;
			const rate = (last.done - first.done) / (dtMs / 1000); // cards/s
			if (rate <= 0) return null;
			return Math.ceil(remaining / rate);
		},
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/ingest/eta.test.ts`
Expected: `5 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/eta.ts scripts/ingest/eta.test.ts
git commit -m "feat(ingest): sliding-window ETA estimator"
```

---

## Task 3: `--log-level` flag + LogLevel type

**Files:**

- Modify: `scripts/ingest/types.ts`
- Modify: `scripts/ingest/config.ts:86-119`

- [ ] **Step 1: Add the LogLevel type to types.ts**

In `scripts/ingest/types.ts`, add near the top (after the imports, before `MpcfillSourceRaw`):

```ts
export type LogLevel = 'debug' | 'info' | 'warn';
```

- [ ] **Step 2: Add `logLevel` to the Flags interface**

In `scripts/ingest/config.ts`, import the type at the top alongside existing imports:

```ts
import type { LogLevel } from './types';
```

Then add to the `Flags` interface (after `reportPath?: string;`):

```ts
logLevel: LogLevel;
```

- [ ] **Step 3: Parse the flag**

In `parseFlags`, add before the final `};`:

```ts
		logLevel: ((): LogLevel => {
			const raw = get('--log-level=');
			return raw === 'debug' || raw === 'warn' ? raw : 'info';
		})(),
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/types.ts scripts/ingest/config.ts
git commit -m "feat(ingest): add --log-level flag (debug|info|warn)"
```

---

## Task 4: the logger module

**Files:**

- Create: `scripts/ingest/logger.ts`
- Test: `scripts/ingest/logger.test.ts`

This is the core. The logger keeps mutable state (active tasks, global counters, recap totals). It writes logfmt events to **stdout** and the multi-bar to **stderr**. Level filtering and TTY detection live here.

- [ ] **Step 1: Write the failing test**

Create `scripts/ingest/logger.test.ts`. We test the parts that are pure-ish: level filtering and the recap aggregation, by capturing `process.stdout.write`. We do NOT test ANSI rendering (it depends on TTY); the multi-bar is suppressed because stderr is not a TTY under `tsx` piped output.

```ts
import { createLogger } from './logger';

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

// Capture stdout lines.
function capture(fn: () => void): string[] {
	const lines: string[] = [];
	const orig = process.stdout.write.bind(process.stdout);
	(process.stdout.write as unknown) = (chunk: string): boolean => {
		lines.push(String(chunk));
		return true;
	};
	try {
		fn();
	} finally {
		(process.stdout.write as unknown) = orig;
	}
	return lines.join('').split('\n').filter(Boolean);
}

// info level: card.resolved (debug-only) is suppressed, source.done passes.
{
	const log = createLogger('info');
	const out = capture(() => {
		log.event('card.resolved', { source: 'mpcfill:foo', card: 'mpc:1', strategy: 'name' });
		log.event('source.done', { source: 'mpcfill:foo', new: 5 });
	});
	check('info suppresses card.resolved', !out.some((l) => l.includes('event=card.resolved')));
	check(
		'info emits source.done',
		out.some((l) => l.includes('event=source.done'))
	);
}

// debug level: card.resolved passes.
{
	const log = createLogger('debug');
	const out = capture(() => {
		log.event('card.resolved', { source: 'mpcfill:foo', card: 'mpc:1', strategy: 'name' });
	});
	check(
		'debug emits card.resolved',
		out.some((l) => l.includes('event=card.resolved'))
	);
}

// warn level: only warn/error + cycle events (run.*, source.done) pass; plain info events drop.
{
	const log = createLogger('warn');
	const out = capture(() => {
		log.event('source.progress', { source: 'mpcfill:foo', done: 10 });
		log.event('source.done', { source: 'mpcfill:foo', new: 5 });
		log.warn('card.failed', { card: 'mpc:2', reason: 'boom' });
	});
	check('warn drops source.progress', !out.some((l) => l.includes('event=source.progress')));
	check(
		'warn keeps source.done',
		out.some((l) => l.includes('event=source.done'))
	);
	check(
		'warn keeps warnings',
		out.some((l) => l.includes('level=warn') && l.includes('event=card.failed'))
	);
}

// every line has the three leading fields in order.
{
	const log = createLogger('info');
	const out = capture(() => {
		log.event('run.start', { sources_total: 3 });
	});
	check(
		'line starts with ts= level= event=',
		out.length === 1 && /^ts=\S+ level=info event=run\.start /.test(out[0])
	);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/ingest/logger.test.ts`
Expected: FAIL — `Cannot find module './logger'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/ingest/logger.ts`:

```ts
// The single output owner for the ingest pipeline.
//
// Two audiences, two streams:
//   • Machine — logfmt events on STDOUT (one line per event), filtered by level.
//   • Human   — a live multi-bar progress block on STDERR (ANSI, TTY only),
//     plus a formatted final recap.
//
// No other ingest file may call console.* or write to stdout/stderr — routing
// everything through here is what keeps logs consistent and parseable.

import { toLogfmt, type LogfmtFields } from './logfmt';
import { createEtaEstimator, type EtaEstimator } from './eta';
import type { LogLevel } from './types';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2 };

// Events that always pass even at level=warn (cycle markers + the recap source).
const CYCLE_EVENTS = new Set(['run.start', 'run.done', 'listing.done', 'source.done']);
// Events only emitted at level=debug.
const DEBUG_ONLY_EVENTS = new Set(['card.resolved']);

const MAX_TASK_BARS = 8;
const ETA_WINDOW_MS = 30_000;
const REDRAW_MIN_INTERVAL_MS = 250; // ~4 fps
const NON_TTY_PROGRESS_INTERVAL_MS = 10_000;

type EventLevel = 'info' | 'warn' | 'error';

interface TaskState {
	label: string;
	done: number;
	of: number;
	ok: number;
	failed: number;
	order: number;
}

export interface Logger {
	event(name: string, fields?: LogfmtFields): void;
	warn(name: string, fields?: LogfmtFields): void;
	error(name: string, fields?: LogfmtFields): void;
	progress: {
		start(globalTotal: number): void;
		taskStart(id: string, label: string, of: number): void;
		taskTick(id: string, delta: { ok?: number; failed?: number }): void;
		taskEnd(id: string): void;
		done(): void;
	};
	recap(text: string): void;
	warningCount(): number;
}

export function createLogger(level: LogLevel): Logger {
	const minRank = LEVEL_RANK[level];
	const isTty = Boolean(process.stderr.isTTY);

	const tasks = new Map<string, TaskState>();
	let taskOrderSeq = 0;
	let globalTotal = 0;
	let globalDone = 0;
	let eta: EtaEstimator | null = null;
	let renderedLines = 0;
	let lastRedraw = 0;
	let lastNonTtyProgress = 0;
	let warnings = 0;

	function shouldEmit(name: string, evLevel: EventLevel): boolean {
		if (evLevel === 'warn' || evLevel === 'error') return true;
		if (DEBUG_ONLY_EVENTS.has(name)) return minRank <= LEVEL_RANK.debug;
		if (level === 'warn') return CYCLE_EVENTS.has(name);
		return true;
	}

	function emit(name: string, evLevel: EventLevel, fields: LogfmtFields): void {
		if (evLevel === 'warn' || evLevel === 'error') warnings++;
		if (!shouldEmit(name, evLevel)) return;
		const head = `ts=${new Date().toISOString()} level=${evLevel} event=${name}`;
		const tail = toLogfmt(fields);
		process.stdout.write(tail ? `${head} ${tail}\n` : `${head}\n`);
	}

	// ── Multi-bar rendering (stderr, TTY only) ────────────────────────────────
	function clearBlock(): void {
		if (renderedLines === 0) return;
		process.stderr.write(`\x1b[${renderedLines}A\x1b[J`);
		renderedLines = 0;
	}

	function bar(done: number, of: number, width: number): string {
		const ratio = of > 0 ? Math.min(1, done / of) : 0;
		const filled = Math.round(ratio * width);
		return '█'.repeat(filled) + '░'.repeat(width - filled);
	}

	function fmtEta(): string {
		const s = eta?.etaSeconds() ?? null;
		if (s === null) return 'ETA —';
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return m > 0 ? `ETA ${m}m${String(sec).padStart(2, '0')}` : `ETA ${sec}s`;
	}

	function pct(done: number, of: number): string {
		return of > 0 ? `${Math.round((done / of) * 100)}%` : '0%';
	}

	function render(force: boolean): void {
		if (!isTty) return;
		const now = Date.now();
		if (!force && now - lastRedraw < REDRAW_MIN_INTERVAL_MS) return;
		lastRedraw = now;

		const cols = process.stderr.columns ?? 80;
		const barWidth = Math.max(8, Math.min(20, cols - 50));
		const lines: string[] = [];

		lines.push(
			`GLOBAL  ${bar(globalDone, globalTotal, barWidth)}  ` +
				`${globalDone}/${globalTotal} (${pct(globalDone, globalTotal)})  · ${fmtEta()}`
		);

		const active = [...tasks.values()].sort((a, b) => a.order - b.order);
		const shown = active.slice(0, MAX_TASK_BARS);
		shown.forEach((t, i) => {
			lines.push(
				`[${i + 1}] ${t.label}  ${bar(t.done, t.of, barWidth)}  ` +
					`${t.done}/${t.of}  ✓${t.ok}${t.failed ? ` ⚠${t.failed}` : ''}`
			);
		});
		const overflow = active.length - shown.length;
		if (overflow > 0) lines.push(`     +${overflow} autres sources en cours…`);

		clearBlock();
		process.stderr.write(lines.map((l) => l.slice(0, cols)).join('\n') + '\n');
		renderedLines = lines.length;
	}

	function nonTtyProgress(force: boolean): void {
		if (isTty) return;
		const now = Date.now();
		if (!force && now - lastNonTtyProgress < NON_TTY_PROGRESS_INTERVAL_MS) return;
		lastNonTtyProgress = now;
		emit('run.progress', 'info', {
			cards_done: globalDone,
			cards_total: globalTotal,
			eta_s: eta?.etaSeconds() ?? null,
		});
	}

	function recomputeGlobalDone(): void {
		// globalDone counts cards finished across all tasks (ok + failed).
		let total = 0;
		for (const t of tasks.values()) total += t.ok + t.failed;
		globalDone = total + finishedDone;
		eta?.record(globalDone);
	}

	// Cards finished by tasks that already ended (removed from the map).
	let finishedDone = 0;

	return {
		event: (name, fields = {}) => emit(name, 'info', fields),
		warn: (name, fields = {}) => emit(name, 'warn', fields),
		error: (name, fields = {}) => emit(name, 'error', fields),
		progress: {
			start(total: number): void {
				globalTotal = total;
				eta = createEtaEstimator(total, ETA_WINDOW_MS);
				eta.record(0);
			},
			taskStart(id: string, label: string, of: number): void {
				tasks.set(id, { label, done: 0, of, ok: 0, failed: 0, order: taskOrderSeq++ });
				render(true);
			},
			taskTick(id: string, delta: { ok?: number; failed?: number }): void {
				const t = tasks.get(id);
				if (!t) return;
				t.ok += delta.ok ?? 0;
				t.failed += delta.failed ?? 0;
				t.done = t.ok + t.failed;
				recomputeGlobalDone();
				render(false);
				nonTtyProgress(false);
			},
			taskEnd(id: string): void {
				const t = tasks.get(id);
				if (t) finishedDone += t.ok + t.failed;
				tasks.delete(id);
				recomputeGlobalDone();
				render(true);
			},
			done(): void {
				clearBlock();
				nonTtyProgress(true);
			},
		},
		recap(text: string): void {
			process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
		},
		warningCount: () => warnings,
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/ingest/logger.test.ts`
Expected: `8 passed, 0 failed`, exit 0.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/logger.ts scripts/ingest/logger.test.ts
git commit -m "feat(ingest): logger with logfmt stdout + multi-bar stderr"
```

---

## Task 5: instantiate the logger as a shared singleton

**Files:**

- Modify: `scripts/ingest/config.ts`

The logger needs to be importable everywhere (like `flags`/`supabase` already are). Add it to config so all modules share one instance built from `flags.logLevel`.

- [ ] **Step 1: Add the logger singleton**

In `scripts/ingest/config.ts`, add the import at the top (with the other relative imports):

```ts
import { createLogger } from './logger';
```

At the very end of the file (after `export const flags = parseFlags(...)`), add:

```ts
// Shared logger singleton — the sole output owner for all ingest modules.
export const logger = createLogger(flags.logLevel);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest/config.ts
git commit -m "feat(ingest): expose shared logger singleton from config"
```

---

## Task 6: route drive-client + image-pipeline through the logger

**Files:**

- Modify: `scripts/ingest/drive-client.ts:21-30`

`image-pipeline.ts` only pushes to a `warnings` array (no `console.*`) — leave it untouched. `drive-client.ts` has one `console.warn` in `fetchWithRetry`.

- [ ] **Step 1: Replace the retry console.warn**

In `scripts/ingest/drive-client.ts`, add to the imports at the top:

```ts
import { config, DRIVE_FILES_URL } from './config';
```

Change to also import the logger (config already imports cleanly here — add a second import line to avoid a circular concern; `logger` is defined after `config`'s own body so importing from `./config` is safe at call time):

```ts
import { config, DRIVE_FILES_URL, logger } from './config';
```

Then in `fetchWithRetry`, replace:

```ts
console.warn(`  ⚠ HTTP ${res.status}, retrying in ${wait}ms…`);
```

with:

```ts
logger.warn('drive.retry', { status: res.status, wait_ms: wait });
```

- [ ] **Step 2: Verify no console.\* remains in drive-client**

Run: `grep -n "console\." scripts/ingest/drive-client.ts`
Expected: no output.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/drive-client.ts
git commit -m "refactor(ingest): route drive-client retry log through logger"
```

---

## Task 7: route db-writer through the logger

**Files:**

- Modify: `scripts/ingest/db-writer.ts` (imports; `backfillDrivePathForSource` at lines ~196-235)

`backfillDrivePathForSource` has the only `console.*` calls in this file.

- [ ] **Step 1: Import the logger**

In `scripts/ingest/db-writer.ts`, change:

```ts
import { supabase, flags } from './config';
```

to:

```ts
import { supabase, flags, logger } from './config';
```

- [ ] **Step 2: Replace the three console calls in backfillDrivePathForSource**

Replace:

```ts
		console.warn(`${prefix} — ⚠ ${msg}`);
		return { updated: 0, failed: 1, warnings };
	}

	console.log(`${prefix} — ${files.length} files to backfill`);
```

with:

```ts
		logger.warn('backfill.drive_list_failed', { source: sourceId, reason: msg });
		return { updated: 0, failed: 1, warnings };
	}

	logger.event('backfill.listed', { source: sourceId, files: files.length });
```

Then replace the final:

```ts
console.log(`${prefix} — ✓ ${updated} updated, ${failed} failed`);
return { updated, failed, warnings };
```

with:

```ts
logger.event('backfill.done', { source: sourceId, updated, failed });
return { updated, failed, warnings };
```

- [ ] **Step 3: Remove the now-unused `prefix` parameter usage**

`backfillDrivePathForSource(sourceId, driveId, prefix)` no longer uses `prefix`. Keep the signature for now (its caller passes it) — to avoid an unused-var lint error, the parameter is still referenced nowhere. Instead, drop `prefix` from the signature and its call site:

In `db-writer.ts`, change the signature:

```ts
export async function backfillDrivePathForSource(
	sourceId: string,
	driveId: string
): Promise<{ updated: number; failed: number; warnings: string[] }> {
```

- [ ] **Step 4: Update the caller in ingest-source.ts**

In `scripts/ingest/ingest-source.ts`, change:

```ts
		} = await backfillDrivePathForSource(sourceId, driveId, prefix);
```

to:

```ts
		} = await backfillDrivePathForSource(sourceId, driveId);
```

- [ ] **Step 5: Verify no console.\* remains in db-writer**

Run: `grep -n "console\." scripts/ingest/db-writer.ts`
Expected: no output.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest/db-writer.ts scripts/ingest/ingest-source.ts
git commit -m "refactor(ingest): route db-writer logs through logger"
```

---

## Task 8: refactor ingest-source.ts to accept pre-listed files + emit events

**Files:**

- Modify: `scripts/ingest/ingest-source.ts` (whole orchestration)

This is the biggest change. `ingestSource` currently lists Drive itself. Phase-0 pre-listing (Task 9) lists all sources up front, so `ingestSource` must accept the files as a parameter. It also drives the progress bars and emits structured events instead of `console.*`.

- [ ] **Step 1: Update the imports**

In `scripts/ingest/ingest-source.ts`, change the config import line:

```ts
import { flags } from './config';
```

to:

```ts
import { flags, logger } from './config';
```

And remove the now-unused `listDriveFolder` import — change:

```ts
import { listDriveFolder } from './drive-client';
```

Delete that line entirely (Phase 0 owns listing now). If nothing else in the file imports from `drive-client`, the line is fully removed.

- [ ] **Step 2: Delete the local `logScryfallStats` helper**

Remove the entire `function logScryfallStats(...) { ... }` block (lines ~43-57). Its output becomes the `source.done` event + per-file `card.unresolved` events.

- [ ] **Step 3: Change the signature to accept pre-listed files**

Change:

```ts
export async function ingestSource(
	source: MpcfillSourceRaw,
	driveId: string,
	index: number,
	total: number,
	validSetCodes: Set<string>
): Promise<IngestResult> {
	const sourceId = `mpcfill:${source.key}`;
	const prefix = `[source ${index}/${total}] ${sourceId}`;
	const warnings: string[] = [];
```

to:

```ts
export async function ingestSource(
	source: MpcfillSourceRaw,
	driveId: string,
	files: DriveImageEntry[],
	index: number,
	total: number,
	validSetCodes: Set<string>
): Promise<IngestResult> {
	const sourceId = `mpcfill:${source.key}`;
	const warnings: string[] = [];
```

- [ ] **Step 4: Replace the backfill warning push**

In the `if (flags.reEnrich && flags.skipScryfall)` block, the `warnings.push(...)` stays (it feeds the report), but there is no console here — leave it. The backfill branch already calls `backfillDrivePathForSource(sourceId, driveId)` (updated in Task 7).

- [ ] **Step 5: Remove the in-function Drive listing**

Delete this block entirely:

```ts
// List Drive files
let files: DriveImageEntry[];
try {
	files = await listDriveFolder(driveId);
} catch (err) {
	const msg = `Drive list failed: ${(err as Error).message}, skipping`;
	warnings.push(msg);
	console.warn(`${prefix} — ⚠ ${msg}`);
	return emptyResult({ failedCount: 1, warnings });
}

console.log(`${prefix} — ${files.length} images found`);
```

(`files` now arrives as a parameter. The Drive-list failure is handled in Phase 0 — a source that failed listing arrives with an empty `files` array and is reported there.)

- [ ] **Step 6: Replace the truncation warning console call**

Change:

```ts
if (truncated) {
	const msg = 'existing cards query may be truncated (≥100k rows)';
	warnings.push(msg);
	console.warn(`${prefix} — ⚠ ${msg}`);
}
```

to:

```ts
if (truncated) {
	const msg = 'existing cards query may be truncated (≥100k rows)';
	warnings.push(msg);
	logger.warn('source.truncated', { source: sourceId });
}
```

- [ ] **Step 7: Emit `source.start` and start the progress bar**

Immediately after `const allPending = [...pending, ...staleCards];`, add:

```ts
logger.event('source.start', {
	source: sourceId,
	idx: index,
	total,
	pending: pending.length,
	stale: staleCards.length,
});
logger.progress.taskStart(sourceId, sourceId, allPending.length);
```

- [ ] **Step 8: Tick the bar + emit card events inside the per-card limiter**

In the `allPending.map((p) => limiter(async () => { ... }))` body, after the resolution-strategy counting block, emit a debug event for resolved cards and a warn event for unresolved. Replace:

```ts
if (!flags.skipScryfall && !p.isReEnrich) {
	if (resolution?.strategy === 'set_num') resolvedBySetNum++;
	else if (resolution?.strategy === 'name') resolvedByName++;
	else if (resolution?.strategy === 'fuzzy') resolvedByFuzzy++;
	else unresolvedFiles.push(p.file.name);
}
```

with:

```ts
if (!flags.skipScryfall && !p.isReEnrich) {
	if (resolution?.strategy) {
		if (resolution.strategy === 'set_num') resolvedBySetNum++;
		else if (resolution.strategy === 'name') resolvedByName++;
		else if (resolution.strategy === 'fuzzy') resolvedByFuzzy++;
		logger.event('card.resolved', {
			source: sourceId,
			card: p.cardId,
			strategy: resolution.strategy,
		});
	} else {
		unresolvedFiles.push(p.file.name);
		logger.warn('card.unresolved', { source: sourceId, file: p.file.name });
	}
}
```

- [ ] **Step 9: Tick on every card completion**

Each branch in the limiter ends by incrementing a counter and returning. Add a `logger.progress.taskTick` at each terminal point so the bar advances. Specifically:

In the re-enrich branch, change:

```ts
if (error) {
	const msg = `Re-enrich update failed for ${p.cardId}: ${error}`;
	warnings.push(msg);
	failedCount++;
	return;
}
reEnrichedCount++;
return;
```

to:

```ts
if (error) {
	const msg = `Re-enrich update failed for ${p.cardId}: ${error}`;
	warnings.push(msg);
	logger.warn('card.failed', { source: sourceId, card: p.cardId, reason: error });
	failedCount++;
	logger.progress.taskTick(sourceId, { failed: 1 });
	return;
}
reEnrichedCount++;
logger.progress.taskTick(sourceId, { ok: 1 });
return;
```

In the duplicate-image branch, change:

```ts
if (img.isDuplicate) {
	duplicateImages++;
	return;
}
```

to:

```ts
if (img.isDuplicate) {
	duplicateImages++;
	logger.progress.taskTick(sourceId, { ok: 1 });
	return;
}
```

In the upsert branch, change:

```ts
const { error } = await upsertNewCard(p, sourceId, resolution, imageHash, storagePath);
if (error) {
	const msg = `Card upsert failed for ${p.cardId}: ${error}`;
	warnings.push(msg);
	console.warn(`  ⚠ ${msg}`);
	failedCount++;
	return;
}
newCount++;
```

to:

```ts
const { error } = await upsertNewCard(p, sourceId, resolution, imageHash, storagePath);
if (error) {
	const msg = `Card upsert failed for ${p.cardId}: ${error}`;
	warnings.push(msg);
	logger.warn('card.failed', { source: sourceId, card: p.cardId, reason: error });
	failedCount++;
	logger.progress.taskTick(sourceId, { failed: 1 });
	return;
}
newCount++;
logger.progress.taskTick(sourceId, { ok: 1 });
```

- [ ] **Step 10: Replace the count-update warning + final summary console calls**

Change:

```ts
const { error: countErr } = await updateSourceCount(sourceId);
if (countErr) {
	const msg = `card_count update failed: ${countErr}`;
	warnings.push(msg);
	console.warn(`${prefix} — ⚠ ${msg}`);
}

console.log(
	`${prefix} — ✓ ${newCount} new, ${skippedCount} skipped, ${failedCount} failed` +
		(reEnrichedCount ? `, ${reEnrichedCount} re-enriched` : '') +
		(imagesMirrored ? `, ${imagesMirrored} mirrored` : '') +
		(duplicateImages ? `, ${duplicateImages} duplicate images` : '')
);
if (!flags.skipScryfall) {
	logScryfallStats(prefix, resolvedBySetNum, resolvedByName, resolvedByFuzzy, unresolvedFiles);
}
```

with:

```ts
const { error: countErr } = await updateSourceCount(sourceId);
if (countErr) {
	const msg = `card_count update failed: ${countErr}`;
	warnings.push(msg);
	logger.warn('source.count_failed', { source: sourceId, reason: countErr });
}

logger.progress.taskEnd(sourceId);
logger.event('source.done', {
	source: sourceId,
	new: newCount,
	skipped: skippedCount,
	failed: failedCount,
	re_enriched: reEnrichedCount,
	mirrored: imagesMirrored,
	dup_images: duplicateImages,
	by_setnum: resolvedBySetNum,
	by_name: resolvedByName,
	by_fuzzy: resolvedByFuzzy,
	unresolved: unresolvedFiles.length,
});
```

- [ ] **Step 11: Verify no console.\* remains**

Run: `grep -n "console\." scripts/ingest/ingest-source.ts`
Expected: no output.

- [ ] **Step 12: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `DriveImageEntry` is now unused-imported or newly-needed, adjust the type import — it is already imported in the file's `import type { DriveImageEntry, IngestResult, MpcfillSourceRaw } from './types';` line, so it stays.)

- [ ] **Step 13: Commit**

```bash
git add scripts/ingest/ingest-source.ts
git commit -m "refactor(ingest): event-driven ingestSource with progress bars"
```

---

## Task 9: Phase-0 pre-listing + run.start/done + recap in the entrypoint

**Files:**

- Modify: `scripts/ingest-mpc-cards.ts`

- [ ] **Step 1: Update imports**

In `scripts/ingest-mpc-cards.ts`, change:

```ts
import { flags } from './ingest/config';
import { extractDriveId } from './ingest/drive-client';
```

to:

```ts
import { flags, logger } from './ingest/config';
import { extractDriveId, listDriveFolder } from './ingest/drive-client';
```

Add to the types import:

```ts
import type { RunReport, SourceReport, DriveImageEntry } from './ingest/types';
```

- [ ] **Step 2: Replace the startup console.log block with run.start**

Change:

```ts
console.log('Fetching sources from mpcfill.com…');
const [rawSources, validSetCodes] = await Promise.all([
	fetchSources(),
	flags.skipScryfall ? Promise.resolve(new Set<string>()) : fetchScryfallSetCodes(),
]);
console.log(`  ✓ ${validSetCodes.size} Scryfall set codes loaded`);
```

to:

```ts
const [rawSources, validSetCodes] = await Promise.all([
	fetchSources(),
	flags.skipScryfall ? Promise.resolve(new Set<string>()) : fetchScryfallSetCodes(),
]);
logger.event('sources.fetched', {
	sources: rawSources.length,
	set_codes: validSetCodes.size,
});
```

- [ ] **Step 3: Replace the no-Drive-ID console.warn**

Change:

```ts
if (!driveId) {
	const msg = `No Drive ID found for source "${s.key}" — externalLink: ${s.externalLink}`;
	runWarnings.push(msg);
	console.warn(`  ⚠ ${msg}`);
	return [];
}
```

to:

```ts
if (!driveId) {
	const msg = `No Drive ID found for source "${s.key}" — externalLink: ${s.externalLink}`;
	runWarnings.push(msg);
	logger.warn('source.no_drive_id', { source: `mpcfill:${s.key}` });
	return [];
}
```

- [ ] **Step 4: Replace the remaining startup console.logs with run.start**

Change:

```ts
if (flags.filterSourceId && filtered.length === 0) {
	console.error(`Source not found: ${flags.filterSourceId}`);
	process.exit(1);
}

if (flags.skipScryfall) console.log('ℹ Scryfall enrichment skipped (--skip-scryfall)\n');
if (flags.reEnrich && !flags.skipScryfall)
	console.log(
		`ℹ Re-enrichment active — cards older than ${flags.reEnrichDays} days will be updated\n`
	);

console.log(`Processing ${filtered.length} sources…\n`);
```

to:

```ts
if (flags.filterSourceId && filtered.length === 0) {
	logger.error('source.not_found', { source: flags.filterSourceId });
	process.exit(1);
}

logger.event('run.start', {
	sources_total: filtered.length,
	skip_scryfall: flags.skipScryfall,
	fuzzy: flags.fuzzy,
	re_enrich: flags.reEnrich,
	re_enrich_days: flags.reEnrichDays,
	mirror: flags.mirrorImages,
	log_level: flags.logLevel,
});
```

- [ ] **Step 5: Insert Phase 0 — pre-list all sources' Drive folders**

Immediately after the `run.start` event (and before the Phase-1 processing), add. In **backfill mode** Phase 0 is skipped (backfill relists internally and has no card total):

```ts
// ── Phase 0: pre-list every source's Drive folder so the global card total
// (and thus the global ETA) is known before any processing starts. Backfill
// mode skips this — it relists internally and has no card total. ──────────
const listings = new Map<string, DriveImageEntry[]>();
if (!flags.backfillDrivePath) {
	const listLimiter = pLimit(5);
	await Promise.all(
		filtered.map(({ raw, driveId }, i) =>
			listLimiter(async () => {
				const sourceId = `mpcfill:${raw.key}`;
				try {
					const files = await listDriveFolder(driveId);
					listings.set(sourceId, files);
					logger.event('listing.source', {
						source: sourceId,
						idx: i + 1,
						total: filtered.length,
						images: files.length,
					});
				} catch (err) {
					const msg = `Drive list failed: ${(err as Error).message}`;
					runWarnings.push(`${sourceId}: ${msg}`);
					logger.warn('listing.failed', { source: sourceId, reason: (err as Error).message });
					listings.set(sourceId, []);
				}
			})
		)
	);
	const cardsTotal = [...listings.values()].reduce((n, f) => n + f.length, 0);
	logger.event('listing.done', { sources: filtered.length, cards_total: cardsTotal });
	logger.progress.start(cardsTotal);
}
```

- [ ] **Step 6: Pass listings into ingestSource**

Change:

```ts
const sourceConcurrency = flags.skipScryfall ? 5 : 1;
const sourceLimiter = pLimit(sourceConcurrency);
const results = await Promise.all(
	filtered.map(({ raw, driveId }, i) =>
		sourceLimiter(() => ingestSource(raw, driveId, i + 1, filtered.length, validSetCodes))
	)
);
```

to:

```ts
const sourceConcurrency = flags.skipScryfall ? 5 : 1;
const sourceLimiter = pLimit(sourceConcurrency);
const results = await Promise.all(
	filtered.map(({ raw, driveId }, i) =>
		sourceLimiter(() =>
			ingestSource(
				raw,
				driveId,
				listings.get(`mpcfill:${raw.key}`) ?? [],
				i + 1,
				filtered.length,
				validSetCodes
			)
		)
	)
);
```

- [ ] **Step 7: Close the progress bars before the recap**

After `const finishedAt = new Date().toISOString();`, add:

```ts
logger.progress.done();
```

- [ ] **Step 8: Replace the JSON dump with run.done + human recap**

Change:

```ts
const reportJson = JSON.stringify(report, null, 2);
console.log('\n✅ Ingestion complete.\n');
console.log(reportJson);

if (flags.reportPath) {
	await writeFile(flags.reportPath, reportJson, 'utf-8');
	console.log(`\nReport written to ${flags.reportPath}`);
}
```

with:

```ts
const durationS = Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
const cardsTotal = sourceReports.reduce(
	(n, s) => n + s.upserted + s.skipped + s.failed + s.reEnriched,
	0
);

logger.event('run.done', {
	sources: sourceReports.length,
	cards_total: cardsTotal,
	new: totals.upserted,
	failed: totals.failed,
	unresolved: totals.unresolvedFiles.length,
	duration_s: durationS,
});

const mins = Math.floor(durationS / 60);
const secs = durationS % 60;
const dur = mins > 0 ? `${mins}m${String(secs).padStart(2, '0')}` : `${secs}s`;
const failedSources = sourceReports.filter((s) => s.failed > 0).length;
logger.recap(
	`\n─── Ingestion terminée en ${dur} ───\n` +
		`  Sources     ${sourceReports.length} traitées · ${failedSources} avec échecs\n` +
		`  Cartes      ${cardsTotal} vues · ${totals.upserted} nouvelles · ` +
		`${totals.skipped} skip · ${totals.failed} échec\n` +
		`  Scryfall    ${sumBy(sourceReports, 'resolved')} résolues · ` +
		`${totals.unresolvedFiles.length} non résolues\n` +
		`  Images      ${totals.imagesMirrored} mirrorées · ${totals.duplicateImages} doublons\n` +
		(logger.warningCount() > 0
			? `  ⚠ ${logger.warningCount()} avertissements (voir events level=warn / --report)\n`
			: '')
);

if (flags.reportPath) {
	await writeFile(flags.reportPath, JSON.stringify(report, null, 2), 'utf-8');
	logger.event('report.written', { path: flags.reportPath });
}
```

- [ ] **Step 9: Add the `sumBy` helper**

At the top of the file, after the imports, add:

```ts
function sumBy(rows: SourceReport[], key: 'resolved'): number {
	return rows.reduce((n, r) => n + r[key], 0);
}
```

- [ ] **Step 10: Replace the fatal error console.error**

Change:

```ts
main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
```

to:

```ts
main().catch((err) => {
	logger.error('run.fatal', { reason: (err as Error).message });
	process.exit(1);
});
```

- [ ] **Step 11: Verify no console.\* remains in the entrypoint**

Run: `grep -n "console\." scripts/ingest-mpc-cards.ts`
Expected: no output.

- [ ] **Step 12: Verify no console.\* remains anywhere in scripts/ingest**

Run: `grep -rn "console\." scripts/ingest-mpc-cards.ts scripts/ingest/`
Expected: no output (config.ts no longer logs either — see Step 13).

- [ ] **Step 13: Route config.ts's own startup logs through the logger**

`config.ts` currently `console.log`s the active env and `console.error`s on missing vars. Because `logger` is created at the bottom of `config.ts` (after `loadConfig()` runs), these specific lines run before the logger exists. Keep them as a deliberate exception OR move them: the simplest correct choice is to leave `config.ts`'s two pre-logger lines as `console.error`/`console.log` (they are bootstrap diagnostics that must work even if logging isn't set up). Update Step 12's expectation accordingly: rerun

Run: `grep -rn "console\." scripts/ingest/ | grep -v config.ts`
Expected: no output.

(Document this exception: `config.ts` bootstrap diagnostics are the only sanctioned `console.*`, since the logger doesn't exist yet at that point.)

- [ ] **Step 14: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add scripts/ingest-mpc-cards.ts
git commit -m "feat(ingest): phase-0 pre-listing, run events, human recap"
```

---

## Task 10: full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check suite**

Run: `npm run check`
Expected: `tsc --noEmit` passes, eslint passes, prettier passes. Fix any prettier/eslint nits with `npm run check:fix` and re-run.

- [ ] **Step 2: Run all new unit tests**

Run:

```bash
npx tsx scripts/ingest/logfmt.test.ts && \
npx tsx scripts/ingest/eta.test.ts && \
npx tsx scripts/ingest/logger.test.ts
```

Expected: each prints `N passed, 0 failed` and exits 0.

- [ ] **Step 3: Smoke test against local Supabase — machine output (piped, non-TTY)**

Prereq: local Supabase running (`npm run sb:start`) and `.env.local`/`.env.ingest` configured with a `GOOGLE_DRIVE_API_KEY`.

Run (skip-scryfall to keep it fast, limit 1 source, pipe stdout so it's non-TTY → logfmt only):

```bash
npx tsx scripts/ingest-mpc-cards.ts --skip-scryfall --limit=1 --log-level=info 1>/tmp/ingest.events 2>/tmp/ingest.human
```

Expected:

- `/tmp/ingest.events` contains only logfmt lines, each starting `ts=… level=… event=…` (verify: `grep -cvE '^ts=\S+ level=\S+ event=\S+' /tmp/ingest.events` prints `0`).
- `/tmp/ingest.events` contains a `run.start`, a `listing.done`, a `source.done`, and a `run.done` line.
- `/tmp/ingest.human` contains the `─── Ingestion terminée` recap.

- [ ] **Step 4: Smoke test — log-level=warn suppresses progress events**

Run:

```bash
npx tsx scripts/ingest-mpc-cards.ts --skip-scryfall --limit=1 --log-level=warn 1>/tmp/ingest.warn 2>/dev/null
```

Expected: `grep -c 'event=source.progress\|event=card.resolved' /tmp/ingest.warn` prints `0`; `grep -c 'event=run.done' /tmp/ingest.warn` prints `1`.

- [ ] **Step 5: Smoke test — interactive multi-bar (manual, optional)**

Run in a real terminal (TTY) so the multi-bar renders on stderr:

```bash
npx tsx scripts/ingest-mpc-cards.ts --skip-scryfall --limit=3 --log-level=info
```

Expected (visual): a `GLOBAL` bar plus per-source bars that update and clear, then the recap. stdout still carries logfmt if you don't redirect it (interleaved is fine for a manual check).

- [ ] **Step 6: Final commit (if check:fix changed anything)**

```bash
git add -A
git commit -m "chore(ingest): formatting + lint fixes for observability work"
```

(Skip if nothing changed.)

---

## Self-review notes (addressed)

- **Spec coverage:** logfmt stdout (T1,T4), multi-bar stderr (T4), ETA via Phase-0 pre-listing (T2,T9), event vocabulary (T4,T8,T9), recap (T9), `--log-level` (T3,T4), single-logger / no-`console.*` rule (T6–T9, enforced by grep steps; config.ts bootstrap is the one sanctioned exception, documented in T9 Step 13), JSON report preserved (T9 Step 8). All covered.
- **Type consistency:** `Logger`/`progress.task*` signatures defined in T4 are called exactly as defined in T8; `ingestSource`'s new `files` param (T8) matches the call site (T9 Step 6); `LogLevel` (T3) flows into `createLogger` (T4) via the config singleton (T5).
- **Non-TTY behavior:** verified by the piped smoke test (T10 Step 3) where the multi-bar is suppressed and only logfmt + recap appear.

```

```
