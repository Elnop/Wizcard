// All Supabase writes/reads for the ingest pipeline: source rows, card upserts,
// re-enrichment, stale-card queries, card_count updates, and drive-path backfill.

import pLimit from 'p-limit';
import { parseCardFilename } from '../../src/lib/mpc/parse-filename';
import type { CardType } from '../../src/lib/mpc/types';
import type { ScryfallResolution } from '../../src/lib/mpc/scryfall-resolver';
import { supabase, flags, logger } from './config';
import { listDriveFolder, driveImageUrl, folderPathToMeta } from './drive-client';
import type { DriveImageEntry, MpcfillSourceRaw, PendingCard } from './types';

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

export async function fetchExistingCards(
	sourceId: string
): Promise<{ doneIds: Set<string>; mirroredIds: Set<string>; truncated: boolean }> {
	const existingSelect = flags.mirrorImages ? 'id, image_storage_path' : 'id';
	const { data: existing } = await supabase
		.from('custom_cards')
		.select(existingSelect)
		.eq('source_id', sourceId)
		.limit(100_000);

	type ExistingRow = { id: string; image_storage_path?: string | null };
	const existingRows = (existing ?? []) as unknown as ExistingRow[];
	const doneIds = new Set(existingRows.map((r) => r.id));
	const mirroredIds = flags.mirrorImages
		? new Set(existingRows.filter((r) => r.image_storage_path).map((r) => r.id))
		: new Set<string>();

	return { doneIds, mirroredIds, truncated: (existing?.length ?? 0) >= 100_000 };
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
	const { data: stale } = await supabase
		.from('custom_cards')
		.select('id, raw_name, card_type, set_code, collector_number, variants, tags')
		.eq('source_id', sourceId)
		.or(`enriched_at.is.null,enriched_at.lt.${threshold}`)
		.limit(100_000);

	return (stale ?? []).map((row) => {
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

export async function upsertNewCard(
	p: PendingCard,
	sourceId: string,
	resolution: ScryfallResolution | null,
	imageHash: string | null,
	storagePath: string | null
): Promise<{ error: string | null }> {
	const { error } = await supabase.from('custom_cards').upsert({
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
	});
	return { error: error?.message ?? null };
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
		})
		.eq('id', cardId);
	return { error: error?.message ?? null };
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
	return { error: error?.message ?? null };
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
