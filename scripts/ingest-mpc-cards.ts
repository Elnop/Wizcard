// MPC card ingest entrypoint — thin orchestrator.
//
// Discovers mpcfill Google Drive sources, ingests each into Supabase (Scryfall
// enrichment, image mirroring, re-enrichment), and writes a JSON run report.
// Heavy lifting lives in scripts/ingest/*. Config/env, the Supabase client and
// CLI flags come from scripts/ingest/config.ts.

import { writeFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import { flags, logger } from './ingest/config';
import { startHud, stopHud } from './ingest/hud-runner';
import { extractDriveId, listDriveFolder } from './ingest/drive-client';
import { fetchSources, fetchScryfallSetCodes } from './ingest/sources';
import { ingestSource } from './ingest/ingest-source';
import { fetchSourceDbState } from './ingest/db-writer';
import { createEnrichQueue } from './ingest/enrich-queue';
import { runEnrichWorker } from './ingest/enrich-worker';
import type { RunReport, SourceReport, DriveImageEntry, IngestResult } from './ingest/types';
import type { SourceDbState } from './ingest/db-writer';

function sumBy(rows: SourceReport[], key: 'resolved'): number {
	return rows.reduce((n, r) => n + r[key], 0);
}

async function main(): Promise<void> {
	const startedAt = new Date().toISOString();
	const runWarnings: string[] = [];
	let results: IngestResult[] = [];

	// Start HUD immediately so all events (including source.no_drive_id warns
	// from fetchSources) are captured and visible from the first frame.
	startHud(logger);

	const [rawSources, validSetCodes] = await Promise.all([
		fetchSources(),
		flags.skipScryfall ? Promise.resolve(new Set<string>()) : fetchScryfallSetCodes(),
	]);
	logger.event('sources.fetched', {
		sources: rawSources.length,
		set_codes: validSetCodes.size,
	});

	const sources = rawSources.flatMap((s) => {
		const driveId = extractDriveId(s.externalLink);
		if (!driveId) {
			const msg = `No Drive ID found for source "${s.key}" — externalLink: ${s.externalLink}`;
			runWarnings.push(msg);
			logger.warn('source.no_drive_id', { source: `mpcfill:${s.key}` });
			return [];
		}
		return [{ raw: s, driveId }];
	});

	let filtered = flags.filterSourceId
		? sources.filter((s) => `mpcfill:${s.raw.key}` === flags.filterSourceId)
		: sources;

	if (flags.limitSources > 0) filtered = filtered.slice(0, flags.limitSources);

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
		parse_only: flags.parseOnly,
		enrich_only: flags.enrichOnly,
		log_level: flags.logLevel,
	});
	logger.setHudFlags({
		sources: filtered.length,
		scryfall: !flags.skipScryfall,
		mirror: flags.mirrorImages,
		fuzzy: flags.fuzzy,
		reEnrich: flags.reEnrich,
	});

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

	// ── Phase 0: prepare every source concurrently ───────────────────────────
	// Drive listing and DB pre-check hit two independent systems (Google Drive vs
	// Supabase) with no data dependency between them, so they run in parallel,
	// each under its own concurrency pool with its own rate budget. As soon as a
	// source's listing AND db-state are both ready, its HUD bar is registered "on
	// the fly" (the HUD already re-sorts active tasks by progress, so display
	// order self-organises). Once all listings are in, the global card total is
	// known and the ETA is started. Backfill mode skips this — it relists
	// internally and has no card total. ──────────────────────────────────────
	const listings = new Map<string, DriveImageEntry[]>();
	const dbStates = new Map<string, SourceDbState>();
	if (!flags.backfillDrivePath) {
		// Drive quota is the sensitive one (Google) — keep it at 5. Supabase has no
		// throttle here, so the DB pre-check can run hotter to finish sooner.
		const listLimiter = pLimit(5);
		const dbStateLimiter = pLimit(10);
		// Several sources ingest in parallel; Stage 1 no longer calls Scryfall
		// inline (Stage 2 does, serialized), so concurrency is safe here.
		const ingestLimiter = pLimit(5);
		const ingestPromises: Array<Promise<{ idx: number; result: IngestResult }>> = [];
		const idxById = new Map<string, number>();
		filtered.forEach(({ raw }, i) => idxById.set(`mpcfill:${raw.key}`, i));

		// Guards against the second pool re-registering a source whose pair is
		// already complete (taskStart is not idempotent — it re-seeds skipCount).
		const registered = new Set<string>();
		const registerTaskHud = (sourceId: string): void => {
			const state = dbStates.get(sourceId);
			const driveFiles = listings.get(sourceId);
			// Register only when BOTH halves are ready, and only once per source.
			if (!state || !driveFiles || registered.has(sourceId)) return;
			registered.add(sourceId);
			const driveCount = driveFiles.length;
			// Mirror ingestSource's skippedCount formula so segments are consistent:
			// skipped = drive files already in DB and not being re-processed.
			// staleCards count toward pending work, not skip. Clamped at driveCount
			// so skipped never exceeds total Drive files.
			const pendingNew = Math.max(0, driveCount - state.doneIds.size);
			const skippedCount = Math.max(0, driveCount - pendingNew - state.staleCount);
			logger.progress.taskStart(
				sourceId,
				sourceId,
				pendingNew + state.staleCount,
				skippedCount,
				skippedCount,
				state.staleCount
			);

			// Pipeline: kick off this source's ingest the moment both halves are
			// ready, rather than waiting on the whole listing barrier.
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

		// Start the global ETA as soon as the card total is known (all listings in),
		// without waiting on the DB pre-check — which is masked behind the listings.
		const listingsDone = Promise.all(listJobs).then(() => {
			const cardsTotal = [...listings.values()].reduce((n, f) => n + f.length, 0);
			logger.event('listing.done', { sources: filtered.length, cards_total: cardsTotal });
			logger.progress.start(cardsTotal);
			logger.progress.enrichStart(0);
		});

		// Stage 2 runs in parallel with Stage 1: it drains the queue as cards are
		// inserted, then does a final DB sweep once the queue is closed.
		const enrichPromise: Promise<{ resolved: number; unresolved: number; failed: number }> =
			runEnrich
				? runEnrichWorker({
						queue: enrichQueue,
						validSetCodes,
						includeStale: flags.reEnrich,
						sourceId: flags.filterSourceId,
					})
				: Promise.resolve({ resolved: 0, unresolved: 0, failed: 0 });

		// By the time this barrier resolves, every source has had both halves
		// listed + pre-checked, so registerTaskHud has fired for each and
		// ingestPromises is fully populated.
		await Promise.all([listingsDone, ...dbJobs]);
		logger.event('precheck.done', { sources: dbStates.size });
		const settled = await Promise.all(ingestPromises);

		// All Stage-1 inserts have pushed to the queue; closing lets the worker's
		// Phase A drain to completion, then run its final DB sweep.
		enrichQueue.close();
		await enrichPromise;

		for (const { idx, result } of settled) results[idx] = result;
	}

	if (flags.backfillDrivePath) {
		results = await Promise.all(
			filtered.map(({ raw, driveId }, i) =>
				ingestSource(raw, driveId, [], i + 1, filtered.length, validSetCodes)
			)
		);
	}

	const finishedAt = new Date().toISOString();
	logger.progress.done();
	stopHud();

	const zeroTotals = {
		resolved: 0,
		skipped: 0,
		failed: 0,
		upserted: 0,
		reEnriched: 0,
		imagesMirrored: 0,
		duplicateImages: 0,
		backfilled: 0,
		unresolvedFiles: [] as string[],
		warnings: [] as string[],
	};

	const sourceReports: SourceReport[] = results.map((r, i) => ({
		sourceId: `mpcfill:${filtered[i].raw.key}`,
		resolved: r.resolvedBySetNum + r.resolvedByName + r.resolvedByFuzzy,
		skipped: r.skippedCount,
		failed: r.failedCount,
		upserted: r.newCount,
		reEnriched: r.reEnrichedCount,
		imagesMirrored: r.imagesMirrored,
		duplicateImages: r.duplicateImages,
		backfilled: r.backfilledCount ?? 0,
		unresolvedFiles: r.unresolvedFiles,
		warnings: r.warnings,
	}));

	const totals = sourceReports.reduce(
		(acc, s) => ({
			resolved: acc.resolved + s.resolved,
			skipped: acc.skipped + s.skipped,
			failed: acc.failed + s.failed,
			upserted: acc.upserted + s.upserted,
			reEnriched: acc.reEnriched + s.reEnriched,
			imagesMirrored: acc.imagesMirrored + s.imagesMirrored,
			duplicateImages: acc.duplicateImages + s.duplicateImages,
			backfilled: acc.backfilled + s.backfilled,
			unresolvedFiles: [...acc.unresolvedFiles, ...s.unresolvedFiles],
			warnings: [...acc.warnings, ...s.warnings],
		}),
		zeroTotals
	);

	const report: RunReport = {
		startedAt,
		finishedAt,
		flags: {
			...(flags.filterSourceId ? { source: flags.filterSourceId } : {}),
			...(flags.limitSources > 0 ? { limit: flags.limitSources } : {}),
			skipScryfall: flags.skipScryfall,
			fuzzy: flags.fuzzy,
			reEnrich: flags.reEnrich,
			reEnrichDays: flags.reEnrichDays,
			checkImageHash: flags.checkImageHash,
			mirrorImages: flags.mirrorImages,
			...(flags.reportPath ? { reportPath: flags.reportPath } : {}),
		},
		sources: sourceReports,
		totals,
		warnings: runWarnings,
	};

	const durationS = Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
	const processedCards = sourceReports.reduce(
		(n, s) => n + s.upserted + s.skipped + s.failed + s.reEnriched,
		0
	);

	logger.event('run.done', {
		sources: sourceReports.length,
		cards_total: processedCards,
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
			`  Cartes      ${processedCards} vues · ${totals.upserted} nouvelles · ` +
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
}

main().catch((err) => {
	stopHud();
	logger.error('run.fatal', { reason: (err as Error).message });
	process.exit(1);
});
