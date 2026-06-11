// All Supabase writes/reads for the ingest pipeline: source rows, card upserts,
// re-enrichment, stale-card queries, card_count updates, and drive-path backfill.

import pLimit from 'p-limit';
import { parseCardFilename } from '../../src/lib/mpc/parse-filename';
import type { CardType } from '../../src/lib/mpc/types';
import type { ScryfallResolution } from '../../src/lib/mpc/scryfall-resolver';
import { supabase, flags, logger } from './config';
import { listDriveFolder, driveImageUrl, folderPathToMeta } from './drive-client';
import type { DriveImageEntry, MpcfillSourceRaw, PendingCard } from './types';

// Supabase errors carry structured fields (code/details/hint) on top of message;
// the bare .message alone (e.g. "An invalid response was received from the
// upstream server" for a 502 gateway error) doesn't say which layer failed or
// why. Fold the available fields into one diagnosable string for logs/reports.
interface DbErrorLike {
	message?: string;
	code?: string;
	details?: string;
	hint?: string;
}
function formatDbError(error: DbErrorLike | null): string | null {
	if (!error) return null;
	const parts = [error.message ?? 'unknown error'];
	if (error.code) parts.push(`code=${error.code}`);
	if (error.details) parts.push(`details=${error.details}`);
	if (error.hint) parts.push(`hint=${error.hint}`);
	return parts.join(' · ');
}

export async function upsertSource(
	source: MpcfillSourceRaw,
	sourceId: string,
	driveId: string
): Promise<void> {
	const { error } = await supabase.from('custom_card_sources').upsert({
		id: sourceId,
		name: source.name,
		description: source.description || null,
		provider: 'mpcfill',
		external_link: source.externalLink || null,
		drive_folder_id: driveId,
		tags: ['mpcfill', source.key],
	});
	if (error) throw new Error(`Source upsert failed: ${error.message}`);
}

export interface SourceDbState {
	doneIds: Set<string>;
	mirroredIds: Set<string>;
	staleCards: PendingCard[];
	skippedCount: number; // doneIds.size - staleCards.length (clamped ≥ 0)
	staleCount: number; // staleCards.length
	truncated: boolean;
}

export async function fetchSourceDbState(
	sourceId: string,
	validSetCodes: Set<string>
): Promise<SourceDbState> {
	const { doneIds, mirroredIds, truncated } = await fetchExistingCards(sourceId);
	const staleCards =
		flags.reEnrich && !flags.skipScryfall ? await fetchStaleCards(sourceId, validSetCodes) : [];
	const staleCount = staleCards.length;
	const skippedCount = Math.max(0, doneIds.size - staleCount);
	return { doneIds, mirroredIds, staleCards, skippedCount, staleCount, truncated };
}

// PostgREST caps every response at `max_rows` (1000 in supabase/config.toml) —
// a bare `.limit(100_000)` is silently truncated to 1000, which made re-runs
// re-process every card past the first 1000 of a source (they looked "not done").
// Page through with `.range()` until a short page comes back to read ALL rows
// regardless of the server cap. `build` re-creates the filtered query per page.
const PAGE_SIZE = 1000;
// Minimal shape of a PostgREST query that supports .range() and resolves to a
// { data, error } result — enough to paginate without importing supabase-js's
// heavily-generic builder types.
interface Rangeable<T> {
	// A stable order is required: without ORDER BY, PostgREST returns rows in an
	// undefined order, so paged .range() windows can overlap or skip rows — which
	// made doneIds non-deterministically incomplete across re-runs.
	order(column: string): {
		range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
	};
}
async function fetchAllRows<T>(build: () => Rangeable<T>): Promise<{ rows: T[]; error: unknown }> {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await build()
			.order('id')
			.range(from, from + PAGE_SIZE - 1);
		if (error) return { rows, error };
		const page = data ?? [];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return { rows, error: null };
}

export async function fetchExistingCards(
	sourceId: string
): Promise<{ doneIds: Set<string>; mirroredIds: Set<string>; truncated: boolean }> {
	const existingSelect = flags.mirrorImages ? 'id, image_storage_path' : 'id';
	type ExistingRow = { id: string; image_storage_path?: string | null };
	const { rows: existingRows } = await fetchAllRows<ExistingRow>(
		() =>
			supabase
				.from('custom_cards')
				.select(existingSelect)
				.eq('source_id', sourceId) as unknown as Rangeable<ExistingRow>
	);
	const doneIds = new Set(existingRows.map((r) => r.id));
	const mirroredIds = flags.mirrorImages
		? new Set(existingRows.filter((r) => r.image_storage_path).map((r) => r.id))
		: new Set<string>();

	// No artificial cap any more — pagination reads everything.
	return { doneIds, mirroredIds, truncated: false };
}

export function buildPendingFromDrive(
	files: DriveImageEntry[],
	doneIds: Set<string>,
	mirroredIds: Set<string>,
	sourceId: string,
	validSetCodes: Set<string>
): PendingCard[] {
	const pending: PendingCard[] = [];
	for (const file of files) {
		const cardId = `mpc:${file.id}`;
		const alreadyMirrored = mirroredIds.has(cardId);
		if (doneIds.has(cardId) && !(flags.mirrorImages && !alreadyMirrored)) continue;
		const parsed = parseCardFilename(file.name);
		const setCode = parsed.setCode && validSetCodes.has(parsed.setCode) ? parsed.setCode : null;
		const { cardType, folderTags } = folderPathToMeta(file.folderPath);
		const allTags = ['custom:mpc', `mpc-source:${sourceId}`, ...folderTags, ...parsed.bracketTags];
		pending.push({
			cardId,
			file,
			parsed,
			setCode,
			cardType,
			allTags,
			isReEnrich: false,
			alreadyMirrored,
		});
	}
	return pending;
}

export async function fetchStaleCards(
	sourceId: string,
	validSetCodes: Set<string>
): Promise<PendingCard[]> {
	const threshold = new Date(Date.now() - flags.reEnrichDays * 86_400_000).toISOString();
	type StaleRow = Record<string, unknown>;
	const { rows: stale } = await fetchAllRows<StaleRow>(
		() =>
			supabase
				.from('custom_cards')
				.select('id, raw_name, card_type, set_code, collector_number, variants, tags')
				.eq('source_id', sourceId)
				.or(`enriched_at.is.null,enriched_at.lt.${threshold}`) as unknown as Rangeable<StaleRow>
	);

	return stale.map((row) => {
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

// Cheap exact count of cards still needing enrichment (same filters as
// fetchUnenrichedCards). head:true fetches no rows — just the count — so the
// Stage-2 worker can show an accurate progress denominator without pulling data.
export async function countUnenrichedCards(opts: {
	includeStale?: boolean;
	sourceId?: string;
}): Promise<number> {
	const { includeStale = false, sourceId } = opts;
	let query = supabase.from('custom_cards').select('*', { count: 'exact', head: true });
	if (sourceId) query = query.eq('source_id', sourceId);
	if (includeStale) {
		const threshold = new Date(Date.now() - flags.reEnrichDays * 86_400_000).toISOString();
		query = query.or(`enriched_at.is.null,enriched_at.lt.${threshold}`);
	} else {
		query = query.is('enriched_at', null);
	}
	const { count } = await query;
	return count ?? 0;
}

// Build the custom_cards row payload for one pending card. Shared by the
// single-card and batch upsert paths so they never drift.
function buildCardRow(
	p: PendingCard,
	sourceId: string,
	resolution: ScryfallResolution | null,
	imageHash: string | null,
	storagePath: string | null
): Record<string, unknown> {
	return {
		id: p.cardId,
		source_id: sourceId,
		name: resolution?.oracleName ?? p.parsed.cardName,
		display_name: p.parsed.cardName,
		raw_name: p.file.name,
		set_code: p.setCode,
		collector_number: p.setCode ? p.parsed.collectorNumber : null,
		variants: p.parsed.variants,
		image_drive_url: driveImageUrl(p.file.id),
		drive_folder_path: p.file.folderPath.length > 0 ? p.file.folderPath.join(' / ') : null,
		...(storagePath ? { image_storage_path: storagePath } : {}),
		...(imageHash ? { image_hash: imageHash } : {}),
		tags: p.allTags,
		is_public: true,
		card_type: p.cardType,
		language: p.parsed.language,
		oracle_id: resolution?.oracleId ?? null,
		enriched_at: resolution ? new Date().toISOString() : null,
		colors: resolution?.colors ?? [],
		color_identity: resolution?.colorIdentity ?? [],
		cmc: resolution?.cmc ?? null,
		type_line: resolution?.typeLine ?? null,
		mana_cost: resolution?.manaCost ?? null,
		oracle_text: resolution?.oracleText ?? null,
		rarity: resolution?.rarity ?? null,
		set_name: resolution?.setName ?? null,
		artist: resolution?.artist ?? null,
	};
}

export async function upsertNewCard(
	p: PendingCard,
	sourceId: string,
	resolution: ScryfallResolution | null,
	imageHash: string | null,
	storagePath: string | null
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from('custom_cards')
		.upsert(buildCardRow(p, sourceId, resolution, imageHash, storagePath));
	return { error: formatDbError(error) };
}

// Default-path insert: no per-card image work, so all cards for a source go in as
// a few bulk upserts (chunks of CARD_UPSERT_CHUNK) instead of one HTTP request
// per card. This is what keeps Supabase from being flooded — a 20k-card source
// becomes ~40 requests, not 20k — and it's far faster. Returns the per-card
// outcome so the caller can tick progress and count failures exactly as before:
// a failed chunk marks all its cards failed (with the chunk's error reason).
const CARD_UPSERT_CHUNK = 500;
export async function upsertNewCardsBatch(
	cards: PendingCard[],
	sourceId: string
): Promise<Array<{ cardId: string; error: string | null }>> {
	const out: Array<{ cardId: string; error: string | null }> = [];
	for (let i = 0; i < cards.length; i += CARD_UPSERT_CHUNK) {
		const chunk = cards.slice(i, i + CARD_UPSERT_CHUNK);
		const rows = chunk.map((p) => buildCardRow(p, sourceId, null, null, null));
		const { error } = await supabase.from('custom_cards').upsert(rows);
		const reason = formatDbError(error);
		for (const p of chunk) out.push({ cardId: p.cardId, error: reason });
	}
	return out;
}

export async function reEnrichCard(
	cardId: string,
	resolution: ScryfallResolution | null
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from('custom_cards')
		.update({
			name: resolution?.oracleName ?? undefined,
			oracle_id: resolution?.oracleId ?? null,
			// Stamp enriched_at on every attempt, resolved or not: an attempted-but-
			// unmatched card is "processed", so the Stage-2 enriched_at IS NULL scan
			// won't re-pull it every run. --re-enrich (enriched_at < threshold) still
			// re-attempts it once it goes stale.
			enriched_at: new Date().toISOString(),
			colors: resolution?.colors ?? [],
			color_identity: resolution?.colorIdentity ?? [],
			cmc: resolution?.cmc ?? null,
			type_line: resolution?.typeLine ?? null,
			mana_cost: resolution?.manaCost ?? null,
			oracle_text: resolution?.oracleText ?? null,
			rarity: resolution?.rarity ?? null,
			set_name: resolution?.setName ?? null,
			artist: resolution?.artist ?? null,
		})
		.eq('id', cardId);
	return { error: formatDbError(error) };
}

export async function updateSourceCount(sourceId: string): Promise<{ error: string | null }> {
	const { count: realCount } = await supabase
		.from('custom_cards')
		.select('*', { count: 'exact', head: true })
		.eq('source_id', sourceId)
		.eq('is_public', true);

	const { error } = await supabase
		.from('custom_card_sources')
		.update({ card_count: realCount ?? 0, last_synced_at: new Date().toISOString() })
		.eq('id', sourceId);
	return { error: formatDbError(error) };
}

export async function backfillDrivePathForSource(
	sourceId: string,
	driveId: string
): Promise<{ updated: number; failed: number; warnings: string[] }> {
	const warnings: string[] = [];
	let updated = 0;
	let failed = 0;

	let files: DriveImageEntry[];
	try {
		files = await listDriveFolder(driveId);
	} catch (err) {
		const msg = `Drive list failed: ${(err as Error).message}, skipping`;
		warnings.push(msg);
		logger.error('backfill.drive_list_failed', { source: sourceId, reason: msg });
		return { updated: 0, failed: 1, warnings };
	}

	logger.event('backfill.listed', { source: sourceId, files: files.length });

	const limiter = pLimit(20);
	await Promise.all(
		files.map((file) =>
			limiter(async () => {
				const cardId = `mpc:${file.id}`;
				const folderPath = file.folderPath.length > 0 ? file.folderPath.join(' / ') : null;
				const { error } = await supabase
					.from('custom_cards')
					.update({ drive_folder_path: folderPath })
					.eq('id', cardId)
					.eq('source_id', sourceId);
				if (error) {
					warnings.push(`drive_folder_path update failed for ${cardId}: ${error.message}`);
					failed++;
				} else {
					updated++;
				}
			})
		)
	);

	logger.event('backfill.done', { source: sourceId, updated, failed });
	return { updated, failed, warnings };
}
