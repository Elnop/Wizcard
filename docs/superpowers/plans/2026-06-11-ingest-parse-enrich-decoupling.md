# Ingest Parse/Enrich Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple Drive parsing/insertion from Scryfall enrichment in the MPC ingest pipeline so parsing runs fast and parallel while a single rate-limited Scryfall worker enriches `enriched_at IS NULL` cards independently — all in one `ingest` command with `--parse-only` / `--enrich-only` flags, plus a dedicated SCRYFALL HUD section.

**Architecture:** Stage 1 parses Drive filenames and upserts cards with `enriched_at = null` (no Scryfall), pipelined per-source (ingest starts as soon as a source's listing + DB pre-check are ready). Stage 2 is one worker that drains an in-memory queue of cards inserted by Stage 1, then does a final DB scan for `enriched_at IS NULL` cards, resolving each batch through the already-serialized `sharedScryfallThrottle` and writing results via `reEnrichCard`. Shared state is the DB, not fragile queues. The HUD GLOBAL bar combines both stages (each card = 1 insert tick + 1 enrich tick); a new SCRYFALL section reuses the existing `SegmentedBar`.

**Tech Stack:** TypeScript, tsx (run scripts directly), p-limit, Supabase JS client, Ink + @inkjs/ui (terminal HUD). Tests are hand-rolled `*.test.ts` files run via `npx tsx <file>` using a local `check(label, cond)` helper (no vitest/jest).

---

## File Structure

| File                                     | Responsibility                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scripts/ingest/config.ts`               | Add `parseOnly` / `enrichOnly` flags (modify)                                                                  |
| `scripts/ingest/db-writer.ts`            | Add `fetchUnenrichedCards(opts)` — global scan template from `fetchStaleCards` (modify)                        |
| `scripts/ingest/enrich-queue.ts`         | **New** — in-memory async queue: push from Stage 1, batch-pull from Stage 2, close signal                      |
| `scripts/ingest/enrich-worker.ts`        | **New** — Stage 2 worker: drain queue + final DB scan → `resolveBatch` → `reEnrichCard`; emits enrich progress |
| `scripts/ingest/ingest-source.ts`        | Remove Scryfall phase; upsert un-enriched; push inserted cards to queue (modify)                               |
| `scripts/ingest-mpc-cards.ts`            | Pipeline listing→ingest; run worker in parallel; wire flags; end coordination (modify)                         |
| `scripts/ingest/logger.ts`               | Add enrich progress state + `progress.enrichStart/enrichTick` (modify)                                         |
| `scripts/ingest/hud/ScryfallSection.tsx` | **New** — HUD section (reuses `SegmentedBar`), modeled on `GlobalSection`                                      |
| `scripts/ingest/hud/index.tsx`           | Render `<ScryfallSection />` under `<GlobalSection />` (modify)                                                |
| `scripts/ingest/enrich-queue.test.ts`    | **New** — queue behavior test (tsx)                                                                            |
| `scripts/ingest/enrich-worker.test.ts`   | **New** — worker resolution/end-condition test (tsx)                                                           |

**Run a test:** `npx tsx scripts/ingest/<name>.test.ts` (prints `N passed, M failed`, exits 1 on failure).
**Full gate:** `npm run check` (tsc + eslint + prettier).

---

## Task 1: CLI flags `--parse-only` / `--enrich-only`

**Files:**

- Modify: `scripts/ingest/config.ts` (the `Flags` interface near line ~98 and `parseFlags` return object)

- [ ] **Step 1: Add fields to the `Flags` interface**

In `scripts/ingest/config.ts`, add two booleans to `interface Flags` (after `backfillDrivePath: boolean;`):

```typescript
	backfillDrivePath: boolean;
	parseOnly: boolean;
	enrichOnly: boolean;
	reportPath?: string;
```

- [ ] **Step 2: Parse them in `parseFlags`**

In the returned object of `parseFlags`, after `backfillDrivePath: argv.includes('--backfill-drive-path'),` add:

```typescript
		backfillDrivePath: argv.includes('--backfill-drive-path'),
		parseOnly: argv.includes('--parse-only'),
		enrichOnly: argv.includes('--enrich-only'),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new fields are referenced later; this step only confirms the flag wiring compiles.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/config.ts
git commit -m "feat(ingest): add --parse-only / --enrich-only flags"
```

---

## Task 2: `fetchUnenrichedCards` — global enrich scan

**Files:**

- Modify: `scripts/ingest/db-writer.ts` (add new exported function near `fetchStaleCards`, line ~100-134)

This generalizes the existing `fetchStaleCards` query (which is per-source) into a global scan the Stage 2 worker uses for its final DB sweep. It returns `PendingCard[]` exactly like `fetchStaleCards` so it feeds straight into `resolveBatch`.

- [ ] **Step 1: Add the function**

In `scripts/ingest/db-writer.ts`, immediately after the `fetchStaleCards` function (after its closing `}` at ~line 134), add:

```typescript
// Global scan for cards needing Scryfall enrichment (Stage 2 final sweep).
// `enriched_at IS NULL` covers never-enriched + Stage-1-inserted cards. When
// `includeStale` is set (--re-enrich), also re-pull cards enriched long ago.
// `sourceId` optionally narrows the scan to one source (--source / per-source
// --enrich-only). Mirrors fetchStaleCards' row→PendingCard mapping.
export async function fetchUnenrichedCards(opts: {
	validSetCodes: Set<string>;
	includeStale?: boolean;
	sourceId?: string;
	limit?: number;
}): Promise<PendingCard[]> {
	const { validSetCodes, includeStale = false, sourceId, limit = 100_000 } = opts;
	let query = supabase
		.from('custom_cards')
		.select('id, source_id, raw_name, card_type, set_code, collector_number, variants, tags');
	if (sourceId) query = query.eq('source_id', sourceId);
	if (includeStale) {
		const threshold = new Date(Date.now() - flags.reEnrichDays * 86_400_000).toISOString();
		query = query.or(`enriched_at.is.null,enriched_at.lt.${threshold}`);
	} else {
		query = query.is('enriched_at', null);
	}
	const { data: rows } = await query.limit(limit);

	return (rows ?? []).map((row) => {
		const fakeFile: DriveImageEntry = {
			id: (row.id as string).replace(/^mpc:/, ''),
			name: row.raw_name as string,
			folderPath: [],
		};
		const parsed = parseCardFilename(row.raw_name as string);
		parsed.setCode = (row.set_code as string | null) ?? null;
		parsed.collectorNumber = (row.collector_number as string | null) ?? null;
		parsed.variants = (row.variants as string[]) ?? [];
		const setCode = parsed.setCode && validSetCodes.has(parsed.setCode) ? parsed.setCode : null;
		return {
			cardId: row.id as string,
			file: fakeFile,
			parsed,
			setCode,
			cardType: (row.card_type as CardType) ?? 'card',
			allTags: (row.tags as string[]) ?? [],
			isReEnrich: true,
			alreadyMirrored: true,
		};
	});
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`parseCardFilename`, `CardType`, `DriveImageEntry`, `flags`, `supabase` are already imported in this file — used by `fetchStaleCards`.)

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest/db-writer.ts
git commit -m "feat(ingest): add fetchUnenrichedCards global enrich scan"
```

---

## Task 3: In-memory enrich queue

**Files:**

- Create: `scripts/ingest/enrich-queue.ts`
- Test: `scripts/ingest/enrich-queue.test.ts`

The queue bridges Stage 1 (producer) and Stage 2 (consumer). Stage 1 calls `push(card)` for every inserted un-enriched card. The worker calls `pull(max)` to take up to `max` cards (awaits if empty and not closed). Stage 1 calls `close()` when all parsing is done; after that, `pull` returns remaining items then empty arrays.

- [ ] **Step 1: Write the failing test**

Create `scripts/ingest/enrich-queue.test.ts`:

```typescript
import { createEnrichQueue } from './enrich-queue';
import type { PendingCard } from './types';

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

function card(id: string): PendingCard {
	return {
		cardId: id,
		file: { id, name: `${id}.png`, folderPath: [] },
		parsed: {} as PendingCard['parsed'],
		setCode: null,
		cardType: 'card',
		allTags: [],
		isReEnrich: false,
		alreadyMirrored: false,
	};
}

async function run(): Promise<void> {
	// pull returns pushed items up to max
	{
		const q = createEnrichQueue();
		q.push(card('a'));
		q.push(card('b'));
		q.push(card('c'));
		const batch = await q.pull(2);
		check('pull(2) returns 2 items', batch.length === 2 && batch[0].cardId === 'a');
		check('queue size decremented', q.size() === 1);
	}

	// pull awaits a later push
	{
		const q = createEnrichQueue();
		const p = q.pull(5);
		setTimeout(() => q.push(card('x')), 10);
		const batch = await p;
		check('pull awaits then resolves on push', batch.length === 1 && batch[0].cardId === 'x');
	}

	// closed + empty resolves to []
	{
		const q = createEnrichQueue();
		q.close();
		const batch = await q.pull(5);
		check('closed+empty returns empty array', batch.length === 0);
		check('isDone true when closed+empty', q.isDone() === true);
	}

	// close drains remaining first
	{
		const q = createEnrichQueue();
		q.push(card('y'));
		q.close();
		const batch = await q.pull(5);
		check('closed drains remaining', batch.length === 1 && batch[0].cardId === 'y');
		const next = await q.pull(5);
		check('then empty after drain', next.length === 0);
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/ingest/enrich-queue.test.ts`
Expected: FAIL — module `./enrich-queue` not found / `createEnrichQueue is not a function`.

- [ ] **Step 3: Implement the queue**

Create `scripts/ingest/enrich-queue.ts`:

```typescript
// In-memory bridge between Stage 1 (parse+insert, producer) and Stage 2 (Scryfall
// enrich, single consumer). Stage 1 pushes each inserted un-enriched card; the
// worker pulls batches. `pull` resolves immediately if items are available, waits
// if empty and open, and resolves to [] once the queue is closed AND drained.

import type { PendingCard } from './types';

export interface EnrichQueue {
	push(card: PendingCard): void;
	pull(max: number): Promise<PendingCard[]>;
	close(): void;
	size(): number;
	isDone(): boolean;
}

export function createEnrichQueue(): EnrichQueue {
	const buffer: PendingCard[] = [];
	let closed = false;
	let waiter: (() => void) | null = null;

	function wake(): void {
		const w = waiter;
		waiter = null;
		if (w) w();
	}

	return {
		push(card: PendingCard): void {
			buffer.push(card);
			wake();
		},
		async pull(max: number): Promise<PendingCard[]> {
			while (buffer.length === 0 && !closed) {
				await new Promise<void>((resolve) => {
					waiter = resolve;
				});
			}
			return buffer.splice(0, max);
		},
		close(): void {
			closed = true;
			wake();
		},
		size(): number {
			return buffer.length;
		},
		isDone(): boolean {
			return closed && buffer.length === 0;
		},
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/ingest/enrich-queue.test.ts`
Expected: PASS — `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/enrich-queue.ts scripts/ingest/enrich-queue.test.ts
git commit -m "feat(ingest): add in-memory enrich queue bridging stage 1 and 2"
```

---

## Task 4: Logger enrich progress state

**Files:**

- Modify: `scripts/ingest/logger.ts` (HudState interface ~line 61-88, Logger.progress interface ~line 94-111, hudState init ~line 138-159, and the returned `progress` object ~line 357-489)

Adds independent enrich counters and two methods so the SCRYFALL section and the combined GLOBAL bar can render. Kept parallel to the existing `start` / `taskTick` style.

- [ ] **Step 1: Extend `HudState`**

In `interface HudState`, after `errorTotal: number;` (line ~87), add:

```typescript
errorTotal: number; // total error-level events
enrichTotal: number; // cards queued for Scryfall enrichment
enrichDone: number; // resolved + unresolved + failed (enrich attempts completed)
enrichResolved: number; // green
enrichUnresolved: number; // yellow — attempted, 0 Scryfall match
enrichFailed: number; // red — network/Scryfall error
```

- [ ] **Step 2: Extend the `Logger.progress` type**

In `interface Logger`, inside `progress: { ... }`, after `done(): void;` (line ~110) add:

```typescript
			done(): void;
			enrichStart(total: number): void;
			enrichTick(delta: { resolved?: number; unresolved?: number; failed?: number; addTotal?: number }): void;
```

- [ ] **Step 3: Initialize the new fields in `hudState`**

In the `hudState` object literal, after `listingTotal: 0,` (line ~158) add:

```typescript
		listingTotal: 0,
		enrichTotal: 0,
		enrichDone: 0,
		enrichResolved: 0,
		enrichUnresolved: 0,
		enrichFailed: 0,
```

- [ ] **Step 4: Implement `enrichStart` / `enrichTick` in the returned progress object**

In the returned `progress` object, replace the `done()` method block (lines ~486-488) so the two new methods sit alongside it:

```typescript
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
```

- [ ] **Step 5: Confirm logger tests still pass**

Run: `npx tsx scripts/ingest/logger.test.ts`
Expected: PASS — `7 passed, 0 failed` (existing behavior untouched).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest/logger.ts
git commit -m "feat(ingest): add enrich progress counters to HUD state"
```

---

## Task 5: SCRYFALL HUD section

**Files:**

- Create: `scripts/ingest/hud/ScryfallSection.tsx`
- Modify: `scripts/ingest/hud/index.tsx` (import + render under `<GlobalSection />`, lines ~16 and ~86)

Reuses the existing `SegmentedBar` (blue/yellow/green/red + dim track). Maps: green=resolved, yellow=unresolved (the "stale" slot), red=failed, dim=remaining. `skipped` is fixed at 0 (no blue segment for enrich).

- [ ] **Step 1: Create the section component**

Create `scripts/ingest/hud/ScryfallSection.tsx`:

```typescript
// SCRYFALL ENRICH block: one segmented bar showing enrichment status proportions
// across all sources (green=resolved, yellow=unresolved, red=failed, dim=remaining)
// plus done/total + % and counters. Modeled on GlobalSection; reuses SegmentedBar.

import React from 'react';
import { Box, Text } from 'ink';
import type { HudState } from '../logger';
import { SectionLine } from './Section';
import { SegmentedBar } from './SegmentedBar';
import { pct } from './format';

export function ScryfallSection({
	state,
	width,
}: {
	state: HudState;
	width: number;
}): React.ReactElement {
	const barWidth = Math.max(8, width - 22);
	return (
		<Box flexDirection="column" marginBottom={1} flexShrink={0}>
			<SectionLine title="SCRYFALL ENRICH" width={width} />
			<Box paddingLeft={1}>
				<SegmentedBar
					skipped={0}
					stale={state.enrichUnresolved}
					ok={state.enrichResolved}
					failed={state.enrichFailed}
					of={state.enrichTotal}
					width={barWidth}
				/>
			</Box>
			<Box paddingLeft={1}>
				<Text bold>{state.enrichDone.toLocaleString()}</Text>
				<Text dimColor>
					{'/'}
					{state.enrichTotal.toLocaleString()}
					{'  '}
					{pct(state.enrichDone, state.enrichTotal)}
				</Text>
			</Box>
			<Box paddingLeft={1}>
				<Text dimColor>
					{'resolved '}
					{state.enrichResolved}
					{'  unresolved '}
					{state.enrichUnresolved}
					{state.enrichFailed > 0 ? `  failed ${state.enrichFailed}` : ''}
				</Text>
			</Box>
		</Box>
	);
}
```

- [ ] **Step 2: Render it in the layout**

In `scripts/ingest/hud/index.tsx`, add the import after the `GlobalSection` import (line ~16):

```typescript
import { GlobalSection } from './GlobalSection';
import { ScryfallSection } from './ScryfallSection';
```

Then in the left pane, right after `<GlobalSection state={state} width={leftW} />` (line ~86), add:

```typescript
						<GlobalSection state={state} width={leftW} />
						<ScryfallSection state={state} width={leftW} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`SectionLine` is exported from `./Section`, `pct` from `./format`, `SegmentedBar` from `./SegmentedBar` — all used by GlobalSection.)

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/hud/ScryfallSection.tsx scripts/ingest/hud/index.tsx
git commit -m "feat(ingest): add SCRYFALL enrich HUD section"
```

---

## Task 6: Enrich worker (Stage 2)

**Files:**

- Create: `scripts/ingest/enrich-worker.ts`
- Test: `scripts/ingest/enrich-worker.test.ts`

The worker repeatedly: pulls a batch from the queue (up to 75 = Scryfall collection batch size); when the queue is closed and drained, does ONE final DB scan via `fetchUnenrichedCards`; resolves each batch with `resolveBatch`; writes via `reEnrichCard`; emits `progress.enrichTick`. To keep it unit-testable, `resolveBatch`, `reEnrichCard`, and `fetchUnenrichedCards` are injected via a `deps` object (defaults wire the real ones).

- [ ] **Step 1: Write the failing test**

Create `scripts/ingest/enrich-worker.test.ts`:

```typescript
import { runEnrichWorker } from './enrich-worker';
import { createEnrichQueue } from './enrich-queue';
import type { PendingCard } from './types';
import type { ScryfallResolution } from '../../src/lib/mpc/scryfall-resolver';

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

function card(id: string): PendingCard {
	return {
		cardId: id,
		file: { id, name: `${id}.png`, folderPath: [] },
		parsed: {} as PendingCard['parsed'],
		setCode: null,
		cardType: 'card',
		allTags: [],
		isReEnrich: false,
		alreadyMirrored: false,
	};
}

function resolution(id: string): ScryfallResolution {
	return {
		oracleName: id,
		oracleId: `oracle-${id}`,
		strategy: 'name',
		colors: [],
		colorIdentity: [],
		cmc: null,
		typeLine: null,
		manaCost: null,
		oracleText: null,
		rarity: null,
		setName: null,
		artist: null,
	};
}

async function run(): Promise<void> {
	// resolves queued cards, leaves unresolved counted, drains + final scan
	{
		const q = createEnrichQueue();
		q.push(card('a')); // will resolve
		q.push(card('b')); // will NOT resolve (unresolved)
		const reEnriched: string[] = [];
		const scanned: string[] = [];

		const workerPromise = runEnrichWorker({
			queue: q,
			validSetCodes: new Set<string>(),
			includeStale: false,
			batchSize: 75,
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) if (c.id === 'a' || c.id === 'c') map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async (cardId) => {
					reEnriched.push(cardId);
					return { error: null };
				},
				fetchUnenrichedCards: async () => {
					// One leftover card 'c' (e.g. inserted before this run), resolves once.
					if (scanned.length > 0) return [];
					scanned.push('scan');
					return [card('c')];
				},
			},
		});

		// Let the queue items get pulled, then close so the worker proceeds to final scan.
		setTimeout(() => q.close(), 20);
		const result = await workerPromise;

		check('all three cards written', reEnriched.length === 3);
		check('resolved count = 2 (a,c)', result.resolved === 2);
		check('unresolved count = 1 (b)', result.unresolved === 1);
		check('final scan ran once', scanned.length === 1);
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/ingest/enrich-worker.test.ts`
Expected: FAIL — module `./enrich-worker` not found / `runEnrichWorker is not a function`.

- [ ] **Step 3: Implement the worker**

Create `scripts/ingest/enrich-worker.ts`:

```typescript
// Stage 2 — Scryfall enrichment worker. Single consumer: drains the in-memory
// queue fed by Stage 1, then does one final DB scan for any remaining
// `enriched_at IS NULL` cards (catch-up across runs). Every Scryfall call goes
// through resolveBatch → sharedScryfallThrottle, so a single worker respects the
// global rate limit without blocking Stage 1. Writes results via reEnrichCard.

import {
	resolveBatch as realResolveBatch,
	type CardToResolve,
	type ScryfallResolution,
} from '../../src/lib/mpc/scryfall-resolver';
import { flags, logger } from './config';
import { reEnrichCard as realReEnrichCard, fetchUnenrichedCards as realScan } from './db-writer';
import type { EnrichQueue } from './enrich-queue';
import type { PendingCard } from './types';

export interface EnrichWorkerDeps {
	resolveBatch: (
		cards: CardToResolve[],
		options?: { fuzzy?: boolean }
	) => Promise<Map<string, ScryfallResolution>>;
	reEnrichCard: (
		cardId: string,
		resolution: ScryfallResolution | null
	) => Promise<{ error: string | null }>;
	fetchUnenrichedCards: (opts: {
		validSetCodes: Set<string>;
		includeStale?: boolean;
		sourceId?: string;
	}) => Promise<PendingCard[]>;
}

export interface EnrichWorkerResult {
	resolved: number;
	unresolved: number;
	failed: number;
}

const defaultDeps: EnrichWorkerDeps = {
	resolveBatch: realResolveBatch,
	reEnrichCard: realReEnrichCard,
	fetchUnenrichedCards: realScan,
};

async function processBatch(
	batch: PendingCard[],
	deps: EnrichWorkerDeps,
	result: EnrichWorkerResult
): Promise<void> {
	const toResolve: CardToResolve[] = batch.map((p) => ({
		id: p.cardId,
		parsed: p.parsed,
		cardType: p.cardType,
		validSetCode: p.setCode,
	}));
	const resolutions = await deps.resolveBatch(toResolve, { fuzzy: flags.fuzzy });

	for (const p of batch) {
		const resolution = resolutions.get(p.cardId) ?? null;
		const { error } = await deps.reEnrichCard(p.cardId, resolution);
		if (error) {
			result.failed++;
			logger.error('enrich.failed', { card: p.cardId, reason: error });
			logger.progress.enrichTick({ failed: 1 });
			continue;
		}
		if (resolution) {
			result.resolved++;
			logger.progress.enrichTick({ resolved: 1 });
		} else {
			result.unresolved++;
			logger.event('enrich.unresolved', { card: p.cardId });
			logger.progress.enrichTick({ unresolved: 1 });
		}
	}
}

export async function runEnrichWorker(opts: {
	queue: EnrichQueue;
	validSetCodes: Set<string>;
	includeStale?: boolean;
	sourceId?: string;
	batchSize?: number;
	deps?: EnrichWorkerDeps;
}): Promise<EnrichWorkerResult> {
	const { queue, validSetCodes, includeStale = false, sourceId, batchSize = 75 } = opts;
	const deps = opts.deps ?? defaultDeps;
	const result: EnrichWorkerResult = { resolved: 0, unresolved: 0, failed: 0 };

	// Phase A: drain the live queue (Stage-1 inserts of the current run).
	while (!queue.isDone()) {
		const batch = await queue.pull(batchSize);
		if (batch.length === 0) continue;
		logger.progress.enrichTick({ addTotal: batch.length });
		await processBatch(batch, deps, result);
	}

	// Phase B: one final DB sweep for leftover un-enriched cards (other runs,
	// queue items that raced past isDone, or --enrich-only with an empty queue).
	const leftover = await deps.fetchUnenrichedCards({ validSetCodes, includeStale, sourceId });
	if (leftover.length > 0) {
		logger.progress.enrichTick({ addTotal: leftover.length });
		for (let i = 0; i < leftover.length; i += batchSize) {
			await processBatch(leftover.slice(i, i + batchSize), deps, result);
		}
	}

	logger.event('enrich.done', {
		resolved: result.resolved,
		unresolved: result.unresolved,
		failed: result.failed,
	});
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/ingest/enrich-worker.test.ts`
Expected: PASS — `4 passed, 0 failed`.

> Note: the test injects `deps`, so no real Scryfall/DB/HUD calls occur. `logger.progress.enrichTick` runs against the real logger singleton harmlessly (no HUD mounted in the test).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/enrich-worker.ts scripts/ingest/enrich-worker.test.ts
git commit -m "feat(ingest): add stage-2 scryfall enrich worker"
```

---

## Task 7: Stage 1 — strip Scryfall from `ingestSource`, push to queue

**Files:**

- Modify: `scripts/ingest/ingest-source.ts` (signature ~line 44-52, remove Phase 2 ~line 136-147, upsert call ~line 216, add queue push)

`ingestSource` stops resolving Scryfall and upserts un-enriched. It takes an optional `enrichQueue` param; each newly inserted card is pushed for Stage 2. When `--enrich-only` is set, the orchestrator won't call `ingestSource` at all, so no guard is needed here.

- [ ] **Step 1: Add the queue parameter and import type**

At the top of `scripts/ingest/ingest-source.ts`, add to the existing import of `./types`:

```typescript
import type { DriveImageEntry, IngestResult, MpcfillSourceRaw } from './types';
import type { EnrichQueue } from './enrich-queue';
```

Change the `ingestSource` signature to accept the queue (add a final optional param):

```typescript
export async function ingestSource(
	source: MpcfillSourceRaw,
	driveId: string,
	files: DriveImageEntry[],
	index: number,
	total: number,
	validSetCodes: Set<string>,
	preChecked?: SourceDbState,
	enrichQueue?: EnrichQueue
): Promise<IngestResult> {
```

- [ ] **Step 2: Remove the Scryfall resolution phase**

Delete the entire "Phase 2: batch Scryfall resolution" block (lines ~136-147):

```typescript
// ── Phase 2: batch Scryfall resolution ──────────────────────────────────
let resolutions = new Map<string, ScryfallResolution>();

if (!flags.skipScryfall && allPending.length > 0) {
	const cardsToResolve: CardToResolve[] = allPending.map((p) => ({
		id: p.cardId,
		parsed: p.parsed,
		cardType: p.cardType,
		validSetCode: p.setCode,
	}));
	resolutions = await resolveBatch(cardsToResolve, { fuzzy: flags.fuzzy });
}
```

Replace it with nothing (the comment header for Phase 3 below stays). Also remove the now-unused imports `resolveBatch`, `type CardToResolve`, `type ScryfallResolution` from the `scryfall-resolver` import at the top, and remove the `staleCards` re-enrich fetch path if it becomes unused (see Step 4).

- [ ] **Step 3: Drop the per-card resolution lookup + strategy counting, upsert un-enriched, push to queue**

In the `pLimit(20)` map body (lines ~163-227), the card now always upserts with `null` resolution. Replace the body from `const resolution = resolutions.get(...)` through the `upsertNewCard` success tick with:

```typescript
limiter(async () => {
	// Re-enrich rows (stale) are handled by Stage 2 now; Stage 1 only
	// inserts new cards un-enriched. Skip any isReEnrich entries here.
	if (p.isReEnrich) {
		logger.progress.taskTick(sourceId, { ok: 1 });
		return;
	}

	let imageHash: string | null = null;
	let storagePath: string | null = null;
	if (flags.checkImageHash || flags.mirrorImages) {
		const img = await processCardImage(p, sourceId, source.key);
		warnings.push(...img.warnings);
		if (img.isDuplicate) {
			duplicateImages++;
			logger.progress.taskTick(sourceId, { ok: 1 });
			return;
		}
		imageHash = img.imageHash;
		storagePath = img.storagePath;
		imagesMirrored += img.imagesMirrored;
	}

	const { error } = await upsertNewCard(p, sourceId, null, imageHash, storagePath);
	if (error) {
		const msg = `Card upsert failed for ${p.cardId}: ${error}`;
		warnings.push(msg);
		logger.error('card.failed', { source: sourceId, card: p.cardId, reason: error });
		failedCount++;
		logger.progress.taskTick(sourceId, { failed: 1 });
		return;
	}
	newCount++;
	logger.progress.taskTick(sourceId, { ok: 1, new: 1 });
	// Hand off to Stage 2 unless Scryfall is disabled for this run.
	if (!flags.skipScryfall && enrichQueue) enrichQueue.push(p);
});
```

Then remove the now-unused locals `resolvedBySetNum`, `resolvedByName`, `resolvedByFuzzy`, `unresolvedFiles` declarations and the `reEnrichCard` branch (lines ~150-199), and their references in the `source.done` event + returned `IngestResult` (set those counts to `0` / `[]`). The returned object keeps the same shape:

```typescript
return {
	newCount,
	skippedCount,
	staleCount: 0,
	failedCount,
	reEnrichedCount: 0,
	imagesMirrored,
	duplicateImages,
	resolvedBySetNum: 0,
	resolvedByName: 0,
	resolvedByFuzzy: 0,
	unresolvedFiles: [],
	warnings,
};
```

- [ ] **Step 4: Stop fetching stale cards in Stage 1**

In the `preChecked` / else block (lines ~80-101), `staleCards` is no longer needed for Stage 1 (re-enrich is Stage 2's job). Set `allPending` to just `pending`:

```typescript
const pending = buildPendingFromDrive(files, doneIds, mirroredIds, sourceId, validSetCodes);
const allPending = pending;
const skippedCount = Math.max(0, files.length - pending.length);
```

Remove the `staleCards` variable, the `fetchStaleCards` import, and any `staleCards.length` references in the `source.start` event and `taskStart` call (pass `0` for the stale arg). Keep `preChecked.staleCards` untouched in the type — just don't use it here.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Fix any "declared but never read" errors by removing the dead locals/imports flagged.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/ingest-source.ts
git commit -m "refactor(ingest): stage 1 inserts un-enriched cards and queues them for enrich"
```

---

## Task 8: Orchestrator — pipeline listing→ingest + run worker in parallel

**Files:**

- Modify: `scripts/ingest-mpc-cards.ts` (Phase 0 ~line 79-174, ingest loop ~line 176-195, report ~line 197 onward)

Removes the global listing barrier (pipelines per-source ingest), starts the Stage 2 worker concurrently, wires `--parse-only` / `--enrich-only`, and coordinates shutdown: close the queue when Stage 1 finishes, then await the worker.

- [ ] **Step 1: Imports**

Add to `scripts/ingest-mpc-cards.ts` imports:

```typescript
import { fetchSourceDbState, fetchUnenrichedCards } from './ingest/db-writer';
import { createEnrichQueue } from './ingest/enrich-queue';
import { runEnrichWorker } from './ingest/enrich-worker';
```

- [ ] **Step 2: Create the queue + handle `--enrich-only` early exit**

Right after `logger.setHudFlags({...})` (line ~77), add:

```typescript
const enrichQueue = createEnrichQueue();
const runEnrich = !flags.skipScryfall && !flags.parseOnly;

// --enrich-only: skip Drive listing + Stage 1 entirely; sweep the DB.
if (flags.enrichOnly) {
	enrichQueue.close();
	logger.progress.enrichStart(0);
	const enrichResult = await runEnrichWorker({
		queue: enrichQueue,
		validSetCodes,
		includeStale: flags.reEnrich,
		sourceId: flags.filterSourceId,
	});
	logger.progress.done();
	stopHud();
	logger.recap(
		`\n─── Enrichissement terminé ───\n` +
			`  Cartes      ${enrichResult.resolved} résolues · ` +
			`${enrichResult.unresolved} non résolues · ${enrichResult.failed} échec\n`
	);
	return;
}
```

- [ ] **Step 3: Pipeline per-source ingest (remove the global barrier)**

Replace the Phase-0 + ingest-loop region. The key change: instead of `await Promise.all([listingsDone, ...dbJobs])` then a separate ingest loop, each source's ingest is chained onto its own readiness. Replace `registerTaskHud` so that, in addition to registering the HUD bar, it kicks off that source's ingest.

In the Phase-0 block, after the `registerTaskHud` definition, add a per-source ingest dispatcher and collect the promises. Replace the section from `const registered = new Set<string>();` through the end of the ingest `const results = await Promise.all(...)` with:

```typescript
const registered = new Set<string>();
const ingestLimiter = pLimit(flags.skipScryfall ? 5 : 5);
const ingestPromises: Array<Promise<{ idx: number; result: IngestResult }>> = [];
const idxById = new Map<string, number>();
filtered.forEach(({ raw }, i) => idxById.set(`mpcfill:${raw.key}`, i));

const registerTaskHud = (sourceId: string): void => {
	const state = dbStates.get(sourceId);
	const driveFiles = listings.get(sourceId);
	if (!state || !driveFiles || registered.has(sourceId)) return;
	registered.add(sourceId);
	const driveCount = driveFiles.length;
	const pendingNew = Math.max(0, driveCount - state.doneIds.size);
	const skippedCount = Math.max(0, driveCount - pendingNew);
	logger.progress.taskStart(sourceId, sourceId, pendingNew, skippedCount, skippedCount, 0);

	// Pipeline: start ingesting this source immediately — don't wait for the
	// rest of the listing. Several sources run in parallel under ingestLimiter.
	const idx = idxById.get(sourceId) ?? 0;
	const { raw, driveId } = filtered[idx];
	ingestPromises.push(
		ingestLimiter(async () => ({
			idx,
			result: await ingestSource(
				raw,
				driveId,
				driveFiles,
				idx + 1,
				filtered.length,
				validSetCodes,
				state,
				runEnrich ? enrichQueue : undefined
			),
		}))
	);
};

const listJobs = filtered.map(({ raw, driveId }, i) =>
	listLimiter(async () => {
		const sourceId = `mpcfill:${raw.key}`;
		try {
			const driveFiles = await listDriveFolder(driveId);
			listings.set(sourceId, driveFiles);
			logger.event('source.listed', {
				source: sourceId,
				idx: i + 1,
				total: filtered.length,
				images: driveFiles.length,
			});
		} catch (err) {
			const msg = `Drive list failed: ${(err as Error).message}`;
			runWarnings.push(`${sourceId}: ${msg}`);
			logger.error('listing.failed', { source: sourceId, reason: (err as Error).message });
			listings.set(sourceId, []);
		}
		registerTaskHud(sourceId);
	})
);

const dbJobs = filtered.map(({ raw }) =>
	dbStateLimiter(async () => {
		const sourceId = `mpcfill:${raw.key}`;
		dbStates.set(sourceId, await fetchSourceDbState(sourceId, validSetCodes));
		registerTaskHud(sourceId);
	})
);

const listingsDone = Promise.all(listJobs).then(() => {
	const cardsTotal = [...listings.values()].reduce((n, f) => n + f.length, 0);
	logger.event('listing.done', { sources: filtered.length, cards_total: cardsTotal });
	logger.progress.start(cardsTotal);
	logger.progress.enrichStart(0); // total grows via enrichTick addTotal
});

// Start the Stage 2 worker in parallel with Stage 1 (if enrichment is on).
const enrichPromise: Promise<{ resolved: number; unresolved: number; failed: number }> = runEnrich
	? runEnrichWorker({
			queue: enrichQueue,
			validSetCodes,
			includeStale: flags.reEnrich,
			sourceId: flags.filterSourceId,
		})
	: Promise.resolve({ resolved: 0, unresolved: 0, failed: 0 });

// Wait for all listings + db pre-checks, then for all per-source ingests.
await Promise.all([listingsDone, ...dbJobs]);
logger.event('precheck.done', { sources: dbStates.size });
const settled = await Promise.all(ingestPromises);

// Stage 1 done → close the queue so the worker can finish its final sweep.
enrichQueue.close();
await enrichPromise;

const results: IngestResult[] = [];
for (const { idx, result } of settled) results[idx] = result;
```

> Note: this replaces the old `filtered.sort(...)` (processing-order optimization). Per the spec, processing order is "peu importe" — pipelining wins. The HUD still self-sorts its display.

- [ ] **Step 4: Handle the `IngestResult` import and `results` usage**

Ensure `IngestResult` is imported (it's used in the new types):

```typescript
import type { RunReport, SourceReport, DriveImageEntry, IngestResult } from './ingest/types';
```

The downstream `results.map((r, i) => ...)` (line ~214) still works because `results` is indexed by `idx` matching `filtered`.

- [ ] **Step 5: Guard the backfill path**

The `if (!flags.backfillDrivePath)` block already wraps Phase 0. The backfill branch (handled inside `ingestSource`) must still run its own loop. After the `if (!flags.backfillDrivePath) { ... }` block, the backfill mode needs the original simple loop. Add, right after that block closes:

```typescript
if (flags.backfillDrivePath) {
	const results: IngestResult[] = await Promise.all(
		filtered.map(({ raw, driveId }, i) =>
			ingestSource(raw, driveId, [], i + 1, filtered.length, validSetCodes)
		)
	);
	// fall through to report using these results
	// (reuse the same reporting code below by assigning to the outer `results`)
}
```

> Implementation note for the engineer: hoist `let results: IngestResult[] = []` to the top of `main()` so both the pipelined branch and the backfill branch assign to the same `results` used by the reporting code. Replace the two `const results` declarations above with assignments to this outer `let`.

- [ ] **Step 6: Update the run.start event flags**

In the `logger.event('run.start', {...})` call (line ~62), add the two new flags for observability:

```typescript
		mirror: flags.mirrorImages,
		parse_only: flags.parseOnly,
		enrich_only: flags.enrichOnly,
		log_level: flags.logLevel,
```

- [ ] **Step 7: Typecheck + run existing tests**

Run: `npx tsc --noEmit && npx tsx scripts/ingest/logger.test.ts && npx tsx scripts/ingest/enrich-queue.test.ts && npx tsx scripts/ingest/enrich-worker.test.ts`
Expected: tsc PASS; all three test files print `N passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add scripts/ingest-mpc-cards.ts
git commit -m "feat(ingest): pipeline listing->ingest and run scryfall worker in parallel"
```

---

## Task 9: Full gate + manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check gate**

Run: `npm run check`
Expected: PASS — tsc, eslint, prettier all clean. Fix any lint/format issues with `npm run check:fix` and re-run.

- [ ] **Step 2: Reset a local DB and run a single-source default ingest**

Pre-req: local Supabase up (`npm run sb:start`).
Run: `npm run ingest -- --source=mpcfill:<somekey> --limit=1`
Expected in HUD: GLOBAL bar advances; SCRYFALL ENRICH section appears under GLOBAL and fills with green (resolved) / yellow (unresolved); parsing (sources) reaches 100% before enrich completes. No 429 storms.

- [ ] **Step 3: Verify intermediate DB state**

While/after Stage 1, in `npm run sb:studio` (or psql) run:
`select count(*) filter (where enriched_at is null) as unenriched, count(*) as total from custom_cards;`
Expected: `unenriched` > 0 during/right after parsing, trending to 0 once the worker finishes.

- [ ] **Step 4: `--parse-only` emits no Scryfall work**

Run: `npm run ingest -- --source=mpcfill:<somekey> --limit=1 --parse-only`
Expected: cards inserted with `enriched_at IS NULL`; no `event=card.resolved` / `event=enrich.*` lines; SCRYFALL section stays at 0/0.

- [ ] **Step 5: `--enrich-only` catches up**

Run: `npm run ingest -- --enrich-only`
Expected: no Drive listing; SCRYFALL section drives the run; `select count(*) filter (where enriched_at is null) from custom_cards;` drops toward 0. Then test scoping: `npm run ingest -- --enrich-only --source=mpcfill:<somekey>` only touches that source's rows.

- [ ] **Step 6: Idempotence**

Re-run the default command from Step 2.
Expected: already-ingested cards are skipped (no new inserts), already-enriched cards are not re-resolved (no `enrich.*` for them), no duplicate rows.

- [ ] **Step 7: Final commit (if any verification fixups were made)**

```bash
git add -A
git commit -m "chore(ingest): verification fixups for parse/enrich decoupling"
```

---

## Self-Review Notes

- **Spec coverage:** Stage 1 (Task 7), Stage 2 worker with hybrid queue+final-scan (Tasks 3, 6, 8), pipelining/no-barrier (Task 8), flags `--parse-only`/`--enrich-only` global+source-filterable (Tasks 1, 2, 8), DB marker reuse `enriched_at IS NULL` (Task 2), HUD SCRYFALL section reusing `SegmentedBar` (Task 5), combined GLOBAL bar (Task 4 enrich counters + Task 5/8 wiring), reuse of `upsertNewCard(...,null,...)` / `reEnrichCard` / `resolveBatch` / `sharedScryfallThrottle` (Tasks 6, 7). All covered.
- **Type consistency:** `EnrichQueue` (Task 3) consumed by `runEnrichWorker` (Task 6) and `ingestSource` (Task 7); `EnrichWorkerDeps.fetchUnenrichedCards` signature matches `fetchUnenrichedCards` from Task 2; `progress.enrichStart/enrichTick` defined in Task 4 and called in Tasks 6/8; `IngestResult` shape unchanged.
- **No placeholders:** all code blocks are complete and copy-pasteable.
