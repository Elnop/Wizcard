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
	skipped: number; // cards already in DB, will not be ticked (blue segment)
	stale: number; // cards pending re-enrich (yellow segment)
	order: number;
	activatedAt?: number; // Date.now() when the source started being processed
}

export interface TaskHudState {
	id: string;
	label: string;
	done: number;
	of: number;
	ok: number;
	failed: number;
	skipped: number; // blue segment: already in DB
	stale: number; // yellow segment: pending re-enrich
	order: number;
	activatedAt?: number; // set once processing begins — distinguishes active vs waiting
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
	globalSkipped: number; // sum of skipped (blue) across all tasks
	globalStale: number; // sum of stale remaining (yellow) across all tasks
	globalFailed: number; // sum of failed (red) across all tasks
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
	enrichTotal: number; // cards queued for Scryfall enrichment
	enrichDone: number; // resolved + unresolved + failed (enrich attempts completed)
	enrichResolved: number; // green
	enrichUnresolved: number; // yellow — attempted, 0 Scryfall match
	enrichFailed: number; // red — network/Scryfall error
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
			alreadySkipped?: number,
			alreadyStale?: number
		): void;
		taskActivate(id: string): void;
		taskTick(
			id: string,
			delta: { ok?: number; failed?: number; new?: number; skip?: number }
		): void;
		taskEnd(id: string): void;
		done(): void;
		enrichStart(total: number): void;
		enrichTick(delta: {
			resolved?: number;
			unresolved?: number;
			failed?: number;
			addTotal?: number;
		}): void;
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
	// Until progress.start() pins the authoritative card total (known once all
	// Drive listings are in), GLOBAL's denominator grows provisionally from each
	// task registered on the fly — so it never shows "/0" during pre-listing.
	let globalTotalPinned = false;

	// ── HudState ─────────────────────────────────────────────────────────────
	const hudState: HudState = {
		flags: { sources: 0, scryfall: false, mirror: false, fuzzy: false, reEnrich: false },
		startedAt: 0,
		globalTotal: 0,
		globalDone: 0,
		globalSkipped: 0,
		globalStale: 0,
		globalFailed: 0,
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
		enrichTotal: 0,
		enrichDone: 0,
		enrichResolved: 0,
		enrichUnresolved: 0,
		enrichFailed: 0,
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
		// Unfinished tasks, ordered: actively-processing sources first (most recently
		// activated on top), then waiting sources by least progress. This keeps the
		// source(s) currently being worked on pinned to the top of the list.
		const active = [...tasks.entries()]
			.map(([id, t]) => ({
				id,
				label: t.label,
				done: t.done,
				of: t.of,
				ok: t.ok,
				failed: t.failed,
				skipped: t.skipped,
				stale: t.stale,
				order: t.order,
				activatedAt: t.activatedAt,
			}))
			.sort((a, b) => {
				// Active (activatedAt set) sorts before waiting.
				const aActive = a.activatedAt !== undefined;
				const bActive = b.activatedAt !== undefined;
				if (aActive !== bActive) return aActive ? -1 : 1;
				// Both active: most recently activated first.
				if (aActive && bActive) return (b.activatedAt ?? 0) - (a.activatedAt ?? 0);
				// Both waiting: least progress first.
				const ratioA = a.of > 0 ? a.done / a.of : 1;
				const ratioB = b.of > 0 ? b.done / b.of : 1;
				return ratioA - ratioB;
			});

		// Finished tasks: completion order (earliest finished at top of finished group).
		const finished = [...finishedTasks.values()].sort(
			(a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0)
		);

		hudState.tasks = [...active, ...finished];
	}

	function syncGlobalSegments(): void {
		// Aggregate skipped/stale/failed across all tasks (active + finished).
		let skipped = 0;
		let stale = 0;
		let failed = 0;
		for (const t of tasks.values()) {
			skipped += t.skipped;
			// stale remaining = original stale minus ok ticks that consumed stale first
			const okBeyondSkipped = Math.max(0, t.ok - t.skipped);
			stale += Math.max(0, t.stale - okBeyondSkipped);
			failed += t.failed;
		}
		for (const t of finishedTasks.values()) {
			skipped += t.skipped;
			// finished tasks: all stale consumed (ok reached end), no remaining stale
			failed += t.failed;
		}
		hudState.globalSkipped = skipped;
		hudState.globalStale = stale;
		hudState.globalFailed = failed;
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
				// Tasks may already be registered when sources are pre-listed on the fly
				// (Drive listing + DB pre-check run concurrently, each source's bar is
				// seeded as soon as its pair is ready). So start() must NOT wipe the task
				// map or the skip seed — it only sets the global total + ETA, then
				// re-derives the running counters from whatever tasks already exist.
				eta = createEtaEstimator(total, ETA_WINDOW_MS);
				if (hudState.startedAt === 0) hudState.startedAt = Date.now();
				globalTotalPinned = true;
				hudState.globalTotal = total;
				hudState.newCount = 0;
				hudState.failCount = 0;
				// skipCount is the sum of each task's seeded skip; rebuild it from tasks.
				let skip = 0;
				for (const t of tasks.values()) skip += t.skipped;
				hudState.skipCount = skip;
				recomputeGlobalDone();
				eta.record(globalDone);
				lastEtaSample = Date.now();
				syncTasksToHud();
				syncGlobalSegments();
				notifyHud();
			},
			taskStart(
				id: string,
				label: string,
				of: number,
				alreadyDone = 0,
				alreadySkipped = 0,
				alreadyStale = 0
			): void {
				// `alreadyDone` seeds cards that count toward the GLOBAL total but are
				// not ticked individually (e.g. skipped/already-ingested on re-runs),
				// so the global bar's denominator (all Drive files) stays honest.
				const order = taskOrderSeq++;
				// A source with nothing to tick (of === 0) is fully skipped / already
				// up to date — there's no real work, so register it as finished right
				// away instead of parking it as "waiting" then flashing a spinner.
				if (of === 0) {
					finishedDone += alreadyDone;
					finishedTasks.set(id, {
						id,
						label,
						done: alreadyDone,
						of: alreadyDone,
						ok: alreadyDone,
						failed: 0,
						skipped: alreadySkipped,
						stale: alreadyStale,
						order,
						finishedAt: Date.now(),
					});
				} else {
					tasks.set(id, {
						label,
						done: alreadyDone,
						of: of + alreadyDone,
						ok: alreadyDone,
						failed: 0,
						skipped: alreadySkipped,
						stale: alreadyStale,
						order,
					});
				}
				hudState.skipCount += alreadySkipped;
				// Before the real total is pinned (pre-listing), grow GLOBAL's
				// denominator with each task so it stays coherent (no "/0").
				if (!globalTotalPinned) hudState.globalTotal += of + alreadyDone;
				recomputeGlobalDone();
				// Sample ETA after seeding alreadyDone so the estimator sees the
				// correct globalDone before any ticks arrive (avoids inflated rate).
				sampleEta(true);
				syncTasksToHud();
				syncGlobalSegments();
				notifyHud();
			},
			taskActivate(id: string): void {
				// Marks a source as actively processing (vs merely listed/waiting), so
				// the HUD can swap its icon and pin it to the top of the source list.
				const t = tasks.get(id);
				if (!t || t.activatedAt !== undefined) return;
				t.activatedAt = Date.now();
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
				syncGlobalSegments();
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
						skipped: t.skipped,
						stale: t.stale,
						order: t.order,
						activatedAt: t.activatedAt,
						finishedAt: Date.now(),
					});
				}
				tasks.delete(id);
				recomputeGlobalDone();
				sampleEta(true);
				syncTasksToHud();
				syncGlobalSegments();
				notifyHud();
			},
			done(): void {
				notifyHud();
			},
			enrichStart(total: number): void {
				hudState.enrichTotal += total;
				notifyHud();
			},
			enrichTick(delta: {
				resolved?: number;
				unresolved?: number;
				failed?: number;
				addTotal?: number;
			}): void {
				hudState.enrichTotal += delta.addTotal ?? 0;
				hudState.enrichResolved += delta.resolved ?? 0;
				hudState.enrichUnresolved += delta.unresolved ?? 0;
				hudState.enrichFailed += delta.failed ?? 0;
				hudState.enrichDone =
					hudState.enrichResolved + hudState.enrichUnresolved + hudState.enrichFailed;
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
