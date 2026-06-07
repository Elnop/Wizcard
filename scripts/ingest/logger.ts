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
	// Cards finished by tasks that already ended (removed from the map).
	let finishedDone = 0;

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
			const failedSuffix = t.failed ? ` ⚠${t.failed}` : '';
			lines.push(
				`[${i + 1}] ${t.label}  ${bar(t.done, t.of, barWidth)}  ` +
					`${t.done}/${t.of}  ✓${t.ok}${failedSuffix}`
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
		// globalDone counts cards finished across all tasks (ok + failed) plus
		// cards from tasks that already ended and were removed from the map.
		let total = 0;
		for (const t of tasks.values()) total += t.ok + t.failed;
		globalDone = total + finishedDone;
		eta?.record(globalDone);
	}

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
