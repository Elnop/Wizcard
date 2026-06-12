// Stage 2 — Scryfall enrichment worker. DB-driven: it repeatedly scans the DB
// for `enriched_at IS NULL` cards (in batches), resolves them via Scryfall and
// writes results via reEnrichCard. No in-memory queue — the DB is the work list,
// so memory stays flat no matter how fast Stage 1 inserts. Every Scryfall call
// goes through resolveBatch → sharedScryfallThrottle, so a single worker respects
// the global rate limit without blocking Stage 1.
//
// Termination: reEnrichCard stamps `enriched_at` on every attempt (resolved or
// not), so processed cards leave the scan set immediately. The loop stops once a
// scan returns no rows AND Stage 1 has signalled it is done inserting. While
// Stage 1 is still running, an empty scan just means "caught up" — the worker
// briefly sleeps and re-polls so new inserts get picked up.

import {
	resolveBatch as realResolveBatch,
	type CardToResolve,
	type ScryfallResolution,
} from '../../src/lib/mpc/scryfall-resolver';
import { flags, logger } from './config';
import {
	reEnrichCard as realReEnrichCard,
	fetchUnenrichedCards as realScan,
	countEnrichSnapshot as realSnapshot,
	type EnrichSnapshot,
} from './db-writer';
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
		limit?: number;
	}) => Promise<PendingCard[]>;
	countEnrichSnapshot: (opts: {
		includeStale?: boolean;
		sourceId?: string;
	}) => Promise<EnrichSnapshot>;
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
	countEnrichSnapshot: realSnapshot,
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function processBatch(
	batch: PendingCard[],
	deps: EnrichWorkerDeps,
	result: EnrichWorkerResult,
	fuzzy: boolean
): Promise<void> {
	const toResolve: CardToResolve[] = batch.map((p) => ({
		id: p.cardId,
		parsed: p.parsed,
		cardType: p.cardType,
		validSetCode: p.setCode,
	}));
	const resolutions = await deps.resolveBatch(toResolve, { fuzzy });

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
	validSetCodes: Set<string>;
	isParsingDone: () => boolean;
	includeStale?: boolean;
	sourceId?: string;
	batchSize?: number;
	idlePollMs?: number;
	totalRefreshMs?: number;
	fuzzy?: boolean;
	deps?: EnrichWorkerDeps;
}): Promise<EnrichWorkerResult> {
	const {
		validSetCodes,
		isParsingDone,
		includeStale = false,
		sourceId,
		batchSize = 75,
		idlePollMs = 500,
		totalRefreshMs = 3000,
		fuzzy = flags.fuzzy,
	} = opts;
	const deps = opts.deps ?? defaultDeps;
	const result: EnrichWorkerResult = { resolved: 0, unresolved: 0, failed: 0 };

	// SCRYFALL bar segments span EVERY card in scope, DB-driven via the snapshot.
	// Only BLUE is frozen; everything else updates live so the segments flow into
	// one another as work happens:
	//   blue  (frozen) = resolved before this run started (skip). Frozen because a
	//                    card this run resolves would otherwise be re-read into blue
	//                    AND counted in green — double-counting. Frozen, it stays a
	//                    clean "was already done before I started" baseline.
	//   total (live)   = every card in scope — moves as listing + Stage 1 insert
	//   yellow (live)  = still-outdated, NOT yet re-attempted this run (--re-enrich).
	//                    As the worker re-enriches a stale card, reEnrichCard stamps
	//                    a fresh enriched_at → it leaves the stale set, so yellow
	//                    shrinks and the card reappears as green (resolved) or red
	//                    (unmatched). Live count makes that transition automatic.
	//   red   (live)   = attempted-but-unmatched (enriched_at set, oracle_id NULL):
	//                    pre-existing + whatever this run just marked.
	//   green (live)   = this run's resolutions (enrichTick counter)
	//   grey  (derived in the view) = total - blue - yellow - green - red
	let frozenBlue: number | null = null;
	const pushSnapshot = async (): Promise<void> => {
		const snap = await deps.countEnrichSnapshot({ includeStale, sourceId });
		// First snapshot pins the skip baseline (resolved before this run started).
		frozenBlue ??= Math.max(0, snap.total - snap.remaining - snap.failedPre - snap.stale);
		logger.progress.enrichSnapshot({
			total: snap.total,
			blue: frozenBlue,
			failed: snap.failedPre,
			stale: snap.stale, // live: shrinks as outdated cards are re-attempted
		});
	};
	let lastSnapshot = 0;

	await pushSnapshot();

	// Poll the DB for un-enriched cards until Stage 1 is done AND nothing is left.
	for (;;) {
		const batch = await deps.fetchUnenrichedCards({
			validSetCodes,
			includeStale,
			sourceId,
			limit: batchSize,
		});

		if (batch.length === 0) {
			// Caught up. If Stage 1 has finished inserting, we're done; otherwise
			// wait briefly for more inserts to land, then re-poll (with a fresh total).
			if (isParsingDone()) break;
			await pushSnapshot();
			await sleep(idlePollMs);
			continue;
		}

		await processBatch(batch, deps, result, fuzzy);

		// Re-snapshot at most every totalRefreshMs (one count query, not per batch)
		// so red (this run's unmatched) and the denominator (Stage-1 inserts) both
		// track live — including in --enrich-only, where parsing is "done" upfront.
		const nowMs = Date.now();
		if (nowMs - lastSnapshot >= totalRefreshMs) {
			lastSnapshot = nowMs;
			await pushSnapshot();
		}
	}

	// Final pin: parsing is done, so this snapshot is the authoritative breakdown.
	await pushSnapshot();

	logger.event('enrich.done', {
		resolved: result.resolved,
		unresolved: result.unresolved,
		failed: result.failed,
	});
	return result;
}
