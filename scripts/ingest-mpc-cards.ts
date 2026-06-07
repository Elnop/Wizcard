// MPC card ingest entrypoint — thin orchestrator.
//
// Discovers mpcfill Google Drive sources, ingests each into Supabase (Scryfall
// enrichment, image mirroring, re-enrichment), and writes a JSON run report.
// Heavy lifting lives in scripts/ingest/*. Config/env, the Supabase client and
// CLI flags come from scripts/ingest/config.ts.

import { writeFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import { flags, logger } from './ingest/config';
import { extractDriveId, listDriveFolder } from './ingest/drive-client';
import { fetchSources, fetchScryfallSetCodes } from './ingest/sources';
import { ingestSource } from './ingest/ingest-source';
import type { RunReport, SourceReport, DriveImageEntry } from './ingest/types';

function sumBy(rows: SourceReport[], key: 'resolved'): number {
	return rows.reduce((n, r) => n + r[key], 0);
}

async function main(): Promise<void> {
	const startedAt = new Date().toISOString();
	const runWarnings: string[] = [];

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
		log_level: flags.logLevel,
	});

	// ── Phase 0: pre-list every source's Drive folder so the global card total
	// (and thus the global ETA) is known before any processing starts. Backfill
	// mode skips this — it relists internally and has no card total. ──────────
	const listings = new Map<string, DriveImageEntry[]>();
	if (!flags.backfillDrivePath) {
		const listLimiter = pLimit(5);
		await Promise.all(
			filtered.map(({ raw, driveId }, i) =>
				listLimiter(async () => {
					const sourceId = `mpcfill:${raw.key}`;
					try {
						const driveFiles = await listDriveFolder(driveId);
						listings.set(sourceId, driveFiles);
						logger.event('listing.source', {
							source: sourceId,
							idx: i + 1,
							total: filtered.length,
							images: driveFiles.length,
						});
					} catch (err) {
						const msg = `Drive list failed: ${(err as Error).message}`;
						runWarnings.push(`${sourceId}: ${msg}`);
						logger.warn('listing.failed', { source: sourceId, reason: (err as Error).message });
						listings.set(sourceId, []);
					}
				})
			)
		);
		const cardsTotal = [...listings.values()].reduce((n, f) => n + f.length, 0);
		logger.event('listing.done', { sources: filtered.length, cards_total: cardsTotal });
		logger.progress.start(cardsTotal);
	}

	// Scryfall uses a global serialized throttle queue — running sources in
	// parallel injects concurrent batch calls that overwhelm the rate limit.
	// With Scryfall active, process one source at a time.
	const sourceConcurrency = flags.skipScryfall ? 5 : 1;
	const sourceLimiter = pLimit(sourceConcurrency);
	const results = await Promise.all(
		filtered.map(({ raw, driveId }, i) =>
			sourceLimiter(() =>
				ingestSource(
					raw,
					driveId,
					listings.get(`mpcfill:${raw.key}`) ?? [],
					i + 1,
					filtered.length,
					validSetCodes
				)
			)
		)
	);

	const finishedAt = new Date().toISOString();
	logger.progress.done();

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
	const cardsTotal = sourceReports.reduce(
		(n, s) => n + s.upserted + s.skipped + s.failed + s.reEnriched,
		0
	);

	logger.event('run.done', {
		sources: sourceReports.length,
		cards_total: cardsTotal,
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
			`  Cartes      ${cardsTotal} vues · ${totals.upserted} nouvelles · ` +
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
	logger.error('run.fatal', { reason: (err as Error).message });
	process.exit(1);
});
