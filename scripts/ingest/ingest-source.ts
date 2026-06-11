// Orchestration for a single MPC source: list Drive, then upsert cards
// un-enriched (Stage 1). Scryfall resolution and enrichment are handled by
// Stage 2 (enrich-worker), which scans the DB for un-enriched cards.

import pLimit from 'p-limit';
import { flags, logger } from './config';
import { processCardImage } from './image-pipeline';
import {
	upsertSource,
	fetchExistingCards,
	buildPendingFromDrive,
	upsertNewCard,
	upsertNewCardsBatch,
	updateSourceCount,
	backfillDrivePathForSource,
} from './db-writer';
import type { SourceDbState } from './db-writer';
import type { DriveImageEntry, IngestResult, MpcfillSourceRaw, PendingCard } from './types';

function emptyResult(overrides: Partial<IngestResult>): IngestResult {
	return {
		newCount: 0,
		skippedCount: 0,
		staleCount: 0,
		failedCount: 0,
		reEnrichedCount: 0,
		imagesMirrored: 0,
		duplicateImages: 0,
		resolvedBySetNum: 0,
		resolvedByName: 0,
		resolvedByFuzzy: 0,
		unresolvedFiles: [],
		warnings: [],
		...overrides,
	};
}

interface InsertCounts {
	newCount: number;
	failedCount: number;
	imagesMirrored: number;
	duplicateImages: number;
	warnings: string[];
}

// Default path: no per-card image work → bulk-upsert in chunks. One HTTP request
// per ~500 cards instead of per card, so Stage 1 doesn't flood Supabase (a 20k
// source becomes ~40 requests, not 20k) and runs far faster.
async function insertBulk(toInsert: PendingCard[], sourceId: string): Promise<InsertCounts> {
	const c: InsertCounts = {
		newCount: 0,
		failedCount: 0,
		imagesMirrored: 0,
		duplicateImages: 0,
		warnings: [],
	};
	const results = await upsertNewCardsBatch(toInsert, sourceId);
	for (const r of results) {
		if (r.error) {
			c.warnings.push(`Card upsert failed for ${r.cardId}: ${r.error}`);
			logger.error('card.failed', { source: sourceId, card: r.cardId, reason: r.error });
			c.failedCount++;
			logger.progress.taskTick(sourceId, { failed: 1 });
		} else {
			c.newCount++;
			logger.progress.taskTick(sourceId, { ok: 1, new: 1 });
		}
	}
	return c;
}

// Image path: each card needs an async hash/mirror step, so keep the bounded
// per-card loop (the image work, not the DB, is the bottleneck here).
async function insertWithImages(
	toInsert: PendingCard[],
	sourceId: string,
	sourceKey: string
): Promise<InsertCounts> {
	const c: InsertCounts = {
		newCount: 0,
		failedCount: 0,
		imagesMirrored: 0,
		duplicateImages: 0,
		warnings: [],
	};
	const limiter = pLimit(20);
	await Promise.all(
		toInsert.map((p) =>
			limiter(async () => {
				const img = await processCardImage(p, sourceId, sourceKey);
				c.warnings.push(...img.warnings);
				if (img.isDuplicate) {
					c.duplicateImages++;
					logger.progress.taskTick(sourceId, { ok: 1 });
					return;
				}
				c.imagesMirrored += img.imagesMirrored;

				const { error } = await upsertNewCard(p, sourceId, null, img.imageHash, img.storagePath);
				if (error) {
					c.warnings.push(`Card upsert failed for ${p.cardId}: ${error}`);
					logger.error('card.failed', { source: sourceId, card: p.cardId, reason: error });
					c.failedCount++;
					logger.progress.taskTick(sourceId, { failed: 1 });
					return;
				}
				c.newCount++;
				logger.progress.taskTick(sourceId, { ok: 1, new: 1 });
			})
		)
	);
	return c;
}

export async function ingestSource(
	source: MpcfillSourceRaw,
	driveId: string,
	files: DriveImageEntry[],
	index: number,
	total: number,
	validSetCodes: Set<string>,
	preChecked?: SourceDbState
): Promise<IngestResult> {
	const sourceId = `mpcfill:${source.key}`;
	const warnings: string[] = [];

	if (flags.reEnrich && flags.skipScryfall) {
		warnings.push('--re-enrich ignoré car --skip-scryfall actif');
	}

	// Backfill mode — relist Drive and update drive_folder_path only, skip everything else
	if (flags.backfillDrivePath) {
		const {
			updated,
			failed,
			warnings: bfWarnings,
		} = await backfillDrivePathForSource(sourceId, driveId);
		return emptyResult({
			failedCount: failed,
			warnings: [...warnings, ...bfWarnings],
			backfilledCount: updated,
		});
	}

	await upsertSource(source, sourceId, driveId);

	let doneIds: Set<string>;
	let mirroredIds: Set<string>;

	if (preChecked) {
		// Reuse data fetched during pre-phase — no extra DB round-trips.
		doneIds = preChecked.doneIds;
		mirroredIds = preChecked.mirroredIds;
		if (preChecked.truncated) {
			const msg = 'existing cards query may be truncated (≥100k rows)';
			warnings.push(msg);
			logger.warn('source.truncated', { source: sourceId });
		}
	} else {
		const fetched = await fetchExistingCards(sourceId);
		doneIds = fetched.doneIds;
		mirroredIds = fetched.mirroredIds;
		if (fetched.truncated) {
			const msg = 'existing cards query may be truncated (≥100k rows)';
			warnings.push(msg);
			logger.warn('source.truncated', { source: sourceId });
		}
	}

	// ── Phase 1: parse filenames, prepare card rows ─────────────────────────
	const pending = buildPendingFromDrive(files, doneIds, mirroredIds, sourceId, validSetCodes);
	const allPending = pending;
	const skippedCount = Math.max(0, files.length - pending.length);

	logger.event('source.start', {
		source: sourceId,
		idx: index,
		total,
		pending: pending.length,
		stale: 0,
	});

	// Only register the task if the pre-phase hasn't done it already.
	if (!preChecked) {
		logger.progress.taskStart(sourceId, sourceId, allPending.length, skippedCount, skippedCount, 0);
	}
	// Mark as actively processing now — swaps its HUD icon and pins it to the top.
	logger.progress.taskActivate(sourceId);

	// ── Phase 2: upsert cards un-enriched ───────────────────────────────────
	// Stage 2 (enrich-worker) picks every inserted card up via its DB scan
	// (enriched_at IS NULL) — no in-memory hand-off needed here.
	// Re-enrich rows are Stage 2's job; Stage 1 only inserts genuinely new cards.
	const toInsert = allPending.filter((p) => !p.isReEnrich);
	const reEnrichOnly = allPending.length - toInsert.length;
	if (reEnrichOnly > 0) logger.progress.taskTick(sourceId, { ok: reEnrichOnly });

	const ins =
		flags.checkImageHash || flags.mirrorImages
			? await insertWithImages(toInsert, sourceId, source.key)
			: await insertBulk(toInsert, sourceId);
	const { newCount, failedCount, imagesMirrored, duplicateImages } = ins;
	warnings.push(...ins.warnings);

	const { error: countErr } = await updateSourceCount(sourceId);
	if (countErr) {
		const msg = `card_count update failed: ${countErr}`;
		warnings.push(msg);
		logger.error('source.count_failed', { source: sourceId, reason: countErr });
	}

	logger.progress.taskEnd(sourceId);
	logger.event('source.done', {
		source: sourceId,
		new: newCount,
		skipped: skippedCount,
		failed: failedCount,
		mirrored: imagesMirrored,
		dup_images: duplicateImages,
	});

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
}
