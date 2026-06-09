// Orchestration for a single MPC source: list Drive, resolve via Scryfall in
// batch, then upsert/re-enrich/mirror cards. Assembles drive-client,
// scryfall-resolver, image-pipeline and db-writer.

import pLimit from 'p-limit';
import {
	resolveBatch,
	type CardToResolve,
	type ScryfallResolution,
} from '../../src/lib/mpc/scryfall-resolver';
import { flags, logger } from './config';
import { processCardImage } from './image-pipeline';
import {
	upsertSource,
	fetchExistingCards,
	buildPendingFromDrive,
	fetchStaleCards,
	upsertNewCard,
	reEnrichCard,
	updateSourceCount,
	backfillDrivePathForSource,
} from './db-writer';
import type { DriveImageEntry, IngestResult, MpcfillSourceRaw } from './types';

function emptyResult(overrides: Partial<IngestResult>): IngestResult {
	return {
		newCount: 0,
		skippedCount: 0,
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

	const { doneIds, mirroredIds, truncated } = await fetchExistingCards(sourceId);
	if (truncated) {
		const msg = 'existing cards query may be truncated (≥100k rows)';
		warnings.push(msg);
		logger.warn('source.truncated', { source: sourceId });
	}

	// ── Phase 1: parse filenames, prepare card rows ─────────────────────────
	const pending = buildPendingFromDrive(files, doneIds, mirroredIds, sourceId, validSetCodes);
	const staleCards =
		flags.reEnrich && !flags.skipScryfall ? await fetchStaleCards(sourceId, validSetCodes) : [];
	const allPending = [...pending, ...staleCards];
	// Drive files that are already ingested and not being re-processed. Defined as
	// the partition complement so that (skippedCount + allPending) == files.length
	// in every mode — keeping the global progress bar's denominator (total Drive
	// files) honest. staleCards are re-enrich work over already-done files, so they
	// move from the skipped bucket into ticked work (subtracted here). Clamped at 0
	// for the rare case of a stale DB card whose Drive file no longer exists.
	const skippedCount = Math.max(0, files.length - pending.length - staleCards.length);

	logger.event('source.start', {
		source: sourceId,
		idx: index,
		total,
		pending: pending.length,
		stale: staleCards.length,
	});
	logger.progress.taskStart(sourceId, sourceId, allPending.length, skippedCount, skippedCount);

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

	// ── Phase 3: upsert all cards ────────────────────────────────────────────
	let newCount = 0;
	let failedCount = 0;
	let reEnrichedCount = 0;
	let imagesMirrored = 0;
	let duplicateImages = 0;
	let resolvedBySetNum = 0;
	let resolvedByName = 0;
	let resolvedByFuzzy = 0;
	const unresolvedFiles: string[] = [];

	const limiter = pLimit(20);
	await Promise.all(
		allPending.map((p) =>
			limiter(async () => {
				const resolution = resolutions.get(p.cardId) ?? null;

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
						const filePath =
							p.file.folderPath.length > 0
								? `${p.file.folderPath.join('/')}/${p.file.name}`
								: p.file.name;
						logger.event('card.unresolved', { source: sourceId, file: filePath });
					}
				}

				if (p.isReEnrich) {
					const { error } = await reEnrichCard(p.cardId, resolution);
					if (error) {
						const msg = `Re-enrich update failed for ${p.cardId}: ${error}`;
						warnings.push(msg);
						logger.error('card.failed', { source: sourceId, card: p.cardId, reason: error });
						failedCount++;
						logger.progress.taskTick(sourceId, { failed: 1 });
						return;
					}
					reEnrichedCount++;
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

				const { error } = await upsertNewCard(p, sourceId, resolution, imageHash, storagePath);
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
			})
		)
	);

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
		re_enriched: reEnrichedCount,
		mirrored: imagesMirrored,
		dup_images: duplicateImages,
		by_setnum: resolvedBySetNum,
		by_name: resolvedByName,
		by_fuzzy: resolvedByFuzzy,
		unresolved: unresolvedFiles.length,
	});

	return {
		newCount,
		skippedCount,
		failedCount,
		reEnrichedCount,
		imagesMirrored,
		duplicateImages,
		resolvedBySetNum,
		resolvedByName,
		resolvedByFuzzy,
		unresolvedFiles,
		warnings,
	};
}
