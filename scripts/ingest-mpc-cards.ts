// MPC card ingest entrypoint — thin orchestrator.
//
// Discovers mpcfill Google Drive sources, ingests each into Supabase (Scryfall
// enrichment, image mirroring, re-enrichment), and writes a JSON run report.
// Heavy lifting lives in scripts/ingest/*. Config/env, the Supabase client and
// CLI flags come from scripts/ingest/config.ts.

import { writeFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import { flags } from './ingest/config';
import { extractDriveId } from './ingest/drive-client';
import { fetchSources, fetchScryfallSetCodes } from './ingest/sources';
import { ingestSource } from './ingest/ingest-source';
import type { RunReport, SourceReport } from './ingest/types';

async function main(): Promise<void> {
	const startedAt = new Date().toISOString();
	const runWarnings: string[] = [];

	console.log('Fetching sources from mpcfill.com…');
	const [rawSources, validSetCodes] = await Promise.all([
		fetchSources(),
		flags.skipScryfall ? Promise.resolve(new Set<string>()) : fetchScryfallSetCodes(),
	]);
	console.log(`  ✓ ${validSetCodes.size} Scryfall set codes loaded`);

	const sources = rawSources.flatMap((s) => {
		const driveId = extractDriveId(s.externalLink);
		if (!driveId) {
			const msg = `No Drive ID found for source "${s.key}" — externalLink: ${s.externalLink}`;
			runWarnings.push(msg);
			console.warn(`  ⚠ ${msg}`);
			return [];
		}
		return [{ raw: s, driveId }];
	});

	let filtered = flags.filterSourceId
		? sources.filter((s) => `mpcfill:${s.raw.key}` === flags.filterSourceId)
		: sources;

	if (flags.limitSources > 0) filtered = filtered.slice(0, flags.limitSources);

	if (flags.filterSourceId && filtered.length === 0) {
		console.error(`Source not found: ${flags.filterSourceId}`);
		process.exit(1);
	}

	if (flags.skipScryfall) console.log('ℹ Scryfall enrichment skipped (--skip-scryfall)\n');
	if (flags.reEnrich && !flags.skipScryfall)
		console.log(
			`ℹ Re-enrichment active — cards older than ${flags.reEnrichDays} days will be updated\n`
		);

	console.log(`Processing ${filtered.length} sources…\n`);

	// Scryfall uses a global serialized throttle queue — running sources in
	// parallel injects concurrent batch calls that overwhelm the rate limit.
	// With Scryfall active, process one source at a time.
	const sourceConcurrency = flags.skipScryfall ? 5 : 1;
	const sourceLimiter = pLimit(sourceConcurrency);
	const results = await Promise.all(
		filtered.map(({ raw, driveId }, i) =>
			sourceLimiter(() => ingestSource(raw, driveId, i + 1, filtered.length, validSetCodes))
		)
	);

	const finishedAt = new Date().toISOString();

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

	const reportJson = JSON.stringify(report, null, 2);
	console.log('\n✅ Ingestion complete.\n');
	console.log(reportJson);

	if (flags.reportPath) {
		await writeFile(flags.reportPath, reportJson, 'utf-8');
		console.log(`\nReport written to ${flags.reportPath}`);
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
