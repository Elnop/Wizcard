// The single output owner for the ingest pipeline.
//
// Two audiences, two streams:
//   • Machine — logfmt events on STDOUT (one line per event), filtered by level.
//   • HUD     — a reactive HudState observable consumed by an external renderer.
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
const ETA_SAMPLE_INTERVAL_MS = 1_000;

type EventLevel = 'info' | 'warn' | 'error';

interface TaskState {
	label: string;
	done: number;
	of: number;
	ok: number;
	failed: number;
	order: number;
}

export interface TaskHudState {
	id: string;
	label: string;
	done: number;
	of: number;
	ok: number;
	failed: number;
	order: number;
	finishedAt?: number; // Date.now() when taskEnd was called
}

export interface HudEvent {
	ts: string; // HH:MM:SS formatted from Date.now()
	level: 'info' | 'warn' | 'error';
	name: string;
	source?: string; // extracted from fields.source if present
	detail: string; // human-readable summary
}

export interface HudState {
	flags: {
		sources: number;
		scryfall: boolean;
		mirror: boolean;
		fuzzy: boolean;
		reEnrich: boolean;
	};
	startedAt: number; // Date.now() at progress.start()
	globalTotal: number;
	globalDone: number;
	etaSeconds: number | null;
	cardsPerSec: number | null; // derived from speed samples
	newCount: number;
	skipCount: number;
	failCount: number;
	tasks: TaskHudState[]; // all tasks (active + recently finished), sorted by order
	phase: 'init' | 'listing' | 'ingesting' | 'done';
	listingDone: number; // sources listed so far in phase-0
	listingTotal: number; // total sources to list in phase-0
	recentEvents: HudEvent[]; // circular buffer, max 200, all levels
	recentWarnings: HudEvent[]; // circular buffer, max 50, warn+error only
	warningTotal: number; // total warn-level events
	errorTotal: number; // total error-level events
}

export interface Logger {
	event(name: string, fields?: LogfmtFields): void;
	warn(name: string, fields?: LogfmtFields): void;
	error(name: string, fields?: LogfmtFields): void;
	progress: {
		start(globalTotal: number): void;
		taskStart(
			id: string,
			label: string,
			of: number,
			alreadyDone?: number,
			alreadySkipped?: number
		): void;
		taskTick(
			id: string,
			delta: { ok?: number; failed?: number; new?: number; skip?: number }
		): void;
		taskEnd(id: string): void;
		done(): void;
	};
	recap(text: string): void;
	warningCount(): number;
	getHudState(): HudState;
	subscribe(cb: () => void): () => void; // returns unsubscribe function
	setHudFlags(flags: HudState['flags']): void;
	setLogStream(stream: NodeJS.WritableStream): void;
}

export function createLogger(level: LogLevel, logStream?: NodeJS.WritableStream): Logger {
	const minRank = LEVEL_RANK[level];
	let out: NodeJS.WritableStream = logStream ?? process.stdout;

	const tasks = new Map<string, TaskState>();
	let taskOrderSeq = 0;
	let globalDone = 0;
	let eta: EtaEstimator | null = null;
	let lastEtaSample = 0;
	let warnings = 0;
	// Cards finished by tasks that already ended (removed from the map).
	let finishedDone = 0;

	// ── HudState ─────────────────────────────────────────────────────────────
	const hudState: HudState = {
		flags: { sources: 0, scryfall: false, mirror: false, fuzzy: false, reEnrich: false },
		startedAt: 0,
		globalTotal: 0,
		globalDone: 0,
		etaSeconds: null,
		cardsPerSec: null,
		newCount: 0,
		skipCount: 0,
		failCount: 0,
		tasks: [],
		recentEvents: [],
		recentWarnings: [],
		warningTotal: 0,
		errorTotal: 0,
		phase: 'init',
		listingDone: 0,
		listingTotal: 0,
	};
	const hudSubscribers = new Set<() => void>();
	const finishedTasks = new Map<string, TaskHudState>();

	function notifyHud(): void {
		for (const cb of hudSubscribers) cb();
	}

	// ── Speed tracker ─────────────────────────────────────────────────────────
	let speedSamples: Array<{ t: number; done: number }> = [];

	function updateSpeed(): void {
		const now = Date.now();
		speedSamples.push({ t: now, done: globalDone });
		const cutoff = now - 10_000; // 10s window for speed
		speedSamples = speedSamples.filter((s) => s.t >= cutoff);
		if (speedSamples.length >= 2) {
			const first = speedSamples[0];
			const last = speedSamples[speedSamples.length - 1];
			const dtS = (last.t - first.t) / 1000;
			hudState.cardsPerSec = dtS > 0 ? Math.round((last.done - first.done) / dtS) : null;
		}
		hudState.globalDone = globalDone;
		hudState.etaSeconds = eta?.etaSeconds() ?? null;
	}

	// ── HH:MM:SS helper ───────────────────────────────────────────────────────
	function hhmmss(ts: number): string {
		const d = new Date(ts);
		return [d.getHours(), d.getMinutes(), d.getSeconds()]
			.map((n) => String(n).padStart(2, '0'))
			.join(':');
	}

	// ── Phase tracking ────────────────────────────────────────────────────────
	function updatePhase(name: string, fields: LogfmtFields): void {
		if (name === 'run.start') {
			hudState.phase = 'listing';
			hudState.listingTotal = typeof fields.sources_total === 'number' ? fields.sources_total : 0;
			hudState.listingDone = 0;
		} else if (name === 'source.listed') {
			hudState.listingDone++;
		} else if (name === 'listing.done') {
			hudState.phase = 'ingesting';
		} else if (name === 'run.done') {
			hudState.phase = 'done';
		}
	}

	// ── pushEvent helper ──────────────────────────────────────────────────────
	function pushEvent(name: string, evLevel: EventLevel, fields: LogfmtFields): void {
		const source = typeof fields.source === 'string' ? fields.source : undefined;
		// Build a short human-readable detail string
		let detail = '';
		if (name === 'card.resolved') {
			detail = `${String(fields.card ?? '')}  (${String(fields.strategy ?? '')})`;
		} else if (name === 'card.unresolved') {
			detail = String(fields.file ?? '');
		} else if (name === 'card.failed') {
			detail = `failed  ${String(fields.card ?? '')}  ${String(fields.reason ?? '')}`;
		} else if (name === 'drive.retry') {
			const why = fields.status ? `HTTP ${String(fields.status)}` : String(fields.reason ?? '');
			detail = `retry  ${why}  (${String(fields.wait_ms ?? '')}ms)`;
		} else if (name === 'source.done') {
			detail = `done  new=${String(fields.new ?? 0)}  skip=${String(fields.skipped ?? 0)}  fail=${String(fields.failed ?? 0)}`;
		} else if (name === 'source.no_drive_id') {
			detail = `pas de Drive ID — vérifier externalLink`;
		} else if (name === 'listing.failed') {
			detail = `Drive listing échoué  ${String(fields.reason ?? '')}`;
		} else if (name === 'source.truncated') {
			detail = `requête tronquée (≥100k lignes)`;
		} else if (name === 'source.count_failed') {
			detail = `card_count update échoué  ${String(fields.reason ?? '')}`;
		} else {
			// generic: serialize all fields as key=value, skip 'source' (shown separately)
			const parts = Object.entries(fields)
				.filter(([k, v]) => k !== 'source' && v !== null && v !== undefined && v !== '')
				.map(([k, v]) => `${k}=${String(v)}`);
			detail = parts.slice(0, 4).join('  ');
		}

		const ev: HudEvent = { ts: hhmmss(Date.now()), level: evLevel, name, source, detail };
		hudState.recentEvents.push(ev);
		if (hudState.recentEvents.length > 200) hudState.recentEvents.shift();
		if (evLevel === 'warn' || evLevel === 'error') {
			hudState.recentWarnings.push(ev);
			if (hudState.recentWarnings.length > 50) hudState.recentWarnings.shift();
		}

		updatePhase(name, fields);
	}

	function shouldEmit(name: string, evLevel: EventLevel): boolean {
		if (evLevel === 'warn' || evLevel === 'error') return true;
		if (DEBUG_ONLY_EVENTS.has(name)) return minRank <= LEVEL_RANK.debug;
		if (level === 'warn') return CYCLE_EVENTS.has(name);
		return true;
	}

	function emit(name: string, evLevel: EventLevel, fields: LogfmtFields): void {
		// always update HUD state regardless of log level filter
		pushEvent(name, evLevel, fields);
		if (evLevel === 'warn') {
			warnings++;
			hudState.warningTotal = warnings;
		} else if (evLevel === 'error') {
			warnings++;
			hudState.errorTotal++;
		}
		notifyHud();
		if (!shouldEmit(name, evLevel)) return;
		const head = `ts=${new Date().toISOString()} level=${evLevel} event=${name}`;
		const tail = toLogfmt(fields);
		out.write(tail ? `${head} ${tail}\n` : `${head}\n`);
	}

	// ── Task sync helper ──────────────────────────────────────────────────────
	function syncTasksToHud(): void {
		hudState.tasks = [...tasks.entries()]
			.map(([id, t]) => ({
				id,
				label: t.label,
				done: t.done,
				of: t.of,
				ok: t.ok,
				failed: t.failed,
				order: t.order,
			}))
			.sort((a, b) => a.order - b.order);
	}

	function recomputeGlobalDone(): void {
		// globalDone counts cards finished across all tasks (ok + failed) plus
		// cards from tasks that already ended and were removed from the map.
		let total = 0;
		for (const t of tasks.values()) total += t.ok + t.failed;
		globalDone = total + finishedDone;
		updateSpeed();
	}

	function sampleEta(force: boolean): void {
		if (!eta) return;
		const now = Date.now();
		if (!force && now - lastEtaSample < ETA_SAMPLE_INTERVAL_MS) return;
		lastEtaSample = now;
		eta.record(globalDone);
	}

	return {
		event: (name, fields = {}) => emit(name, 'info', fields),
		warn: (name, fields = {}) => emit(name, 'warn', fields),
		error: (name, fields = {}) => emit(name, 'error', fields),
		progress: {
			start(total: number): void {
				eta = createEtaEstimator(total, ETA_WINDOW_MS);
				eta.record(0);
				lastEtaSample = Date.now();
				hudState.startedAt = Date.now();
				hudState.globalTotal = total;
				hudState.globalDone = 0;
				hudState.newCount = 0;
				hudState.skipCount = 0;
				hudState.failCount = 0;
				hudState.tasks = [];
				notifyHud();
			},
			taskStart(id: string, label: string, of: number, alreadyDone = 0, alreadySkipped = 0): void {
				// `alreadyDone` seeds cards that count toward the GLOBAL total but are
				// not ticked individually (e.g. skipped/already-ingested on re-runs),
				// so the global bar's denominator (all Drive files) stays honest.
				tasks.set(id, {
					label,
					done: alreadyDone,
					of: of + alreadyDone,
					ok: alreadyDone,
					failed: 0,
					order: taskOrderSeq++,
				});
				hudState.skipCount += alreadySkipped;
				recomputeGlobalDone();
				syncTasksToHud();
				notifyHud();
			},
			taskTick(
				id: string,
				delta: { ok?: number; failed?: number; new?: number; skip?: number }
			): void {
				const t = tasks.get(id);
				if (!t) return;
				t.ok += delta.ok ?? 0;
				t.failed += delta.failed ?? 0;
				t.done = t.ok + t.failed;
				hudState.newCount += delta.new ?? 0;
				hudState.skipCount += delta.skip ?? 0;
				hudState.failCount += delta.failed ?? 0;
				recomputeGlobalDone();
				sampleEta(false);
				syncTasksToHud();
				notifyHud();
			},
			taskEnd(id: string): void {
				const t = tasks.get(id);
				if (t) {
					finishedDone += t.ok + t.failed;
					finishedTasks.set(id, {
						id,
						label: t.label,
						done: t.done,
						of: t.of,
						ok: t.ok,
						failed: t.failed,
						order: t.order,
						finishedAt: Date.now(),
					});
				}
				tasks.delete(id);
				recomputeGlobalDone();
				sampleEta(true);
				syncTasksToHud(); // will only include active tasks
				// also include recently finished tasks in hudState
				hudState.tasks = [...hudState.tasks, ...finishedTasks.values()].sort(
					(a, b) => a.order - b.order
				);
				notifyHud();
			},
			done(): void {
				notifyHud();
			},
		},
		recap(text: string): void {
			process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
		},
		warningCount: () => warnings,
		getHudState: () => ({
			...hudState,
			tasks: [...hudState.tasks],
			recentEvents: [...hudState.recentEvents],
			recentWarnings: [...hudState.recentWarnings],
		}),
		subscribe: (cb: () => void) => {
			hudSubscribers.add(cb);
			// fire immediately so late subscribers (mounted after events) get current state
			cb();
			return () => hudSubscribers.delete(cb);
		},
		setHudFlags(f: HudState['flags']): void {
			hudState.flags = f;
			notifyHud();
		},
		setLogStream(stream: NodeJS.WritableStream): void {
			out = stream;
		},
	};
}

// Keep MAX_TASK_BARS exported in case external modules reference it.
export { MAX_TASK_BARS };
