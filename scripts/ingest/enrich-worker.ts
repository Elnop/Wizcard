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
	countUnenrichedCards as realCount,
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
	countUnenrichedCards: (opts: { includeStale?: boolean; sourceId?: string }) => Promise<number>;
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
	countUnenrichedCards: realCount,
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

	// Keep the progress denominator accurate: total = cards already processed this
	// run + the live DB count of what's still un-enriched. Refresh from the DB
	// periodically while Stage 1 is still inserting (so the bar grows with new
	// inserts), and re-count once parsing is done to pin the final total.
	const done = (): number => result.resolved + result.unresolved + result.failed;
	const refreshTotal = async (): Promise<void> => {
		const remaining = await deps.countUnenrichedCards({ includeStale, sourceId });
		logger.progress.enrichSetTotal(done() + remaining);
	};
	let lastTotalRefresh = 0;

	await refreshTotal();

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
			await refreshTotal();
			await sleep(idlePollMs);
			continue;
		}

		await processBatch(batch, deps, result, fuzzy);

		// Re-count at most every totalRefreshMs so the denominator tracks Stage-1
		// inserts without a count query per batch.
		const nowMs = Date.now();
		if (!isParsingDone() && nowMs - lastTotalRefresh >= totalRefreshMs) {
			lastTotalRefresh = nowMs;
			await refreshTotal();
		}
	}

	// Final pin: parsing is done, so this count is the authoritative remaining work.
	await refreshTotal();

	logger.event('enrich.done', {
		resolved: result.resolved,
		unresolved: result.unresolved,
		failed: result.failed,
	});
	return result;
}
