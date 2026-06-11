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
	queue: EnrichQueue;
	validSetCodes: Set<string>;
	includeStale?: boolean;
	sourceId?: string;
	batchSize?: number;
	fuzzy?: boolean;
	deps?: EnrichWorkerDeps;
}): Promise<EnrichWorkerResult> {
	const {
		queue,
		validSetCodes,
		includeStale = false,
		sourceId,
		batchSize = 75,
		fuzzy = flags.fuzzy,
	} = opts;
	const deps = opts.deps ?? defaultDeps;
	const result: EnrichWorkerResult = { resolved: 0, unresolved: 0, failed: 0 };

	// Phase A: drain the live queue (Stage-1 inserts of the current run).
	while (!queue.isDone()) {
		const batch = await queue.pull(batchSize);
		if (batch.length === 0) continue;
		logger.progress.enrichTick({ addTotal: batch.length });
		await processBatch(batch, deps, result, fuzzy);
	}

	// Phase B: one final DB sweep for leftover un-enriched cards (other runs,
	// queue items that raced past isDone, or --enrich-only with an empty queue).
	const leftover = await deps.fetchUnenrichedCards({ validSetCodes, includeStale, sourceId });
	if (leftover.length > 0) {
		logger.progress.enrichTick({ addTotal: leftover.length });
		for (let i = 0; i < leftover.length; i += batchSize) {
			await processBatch(leftover.slice(i, i + batchSize), deps, result, fuzzy);
		}
	}

	logger.event('enrich.done', {
		resolved: result.resolved,
		unresolved: result.unresolved,
		failed: result.failed,
	});
	return result;
}
