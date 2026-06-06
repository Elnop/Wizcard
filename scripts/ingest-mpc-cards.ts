import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { parseCardFilename } from '../src/lib/mpc/parse-filename';
import {
	resolveBatch,
	type CardToResolve,
	type ScryfallResolution,
} from '../src/lib/mpc/scryfall-resolver';
import type { CardType } from '../src/lib/mpc/types';

// ─── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY ?? '';
const MPCFILL_URL = 'https://mpcfill.com/2/sources/';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const SCRYFALL_SETS_URL = 'https://api.scryfall.com/sets';
const SCRYFALL_USER_AGENT = 'Wizcard/1.0';

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error('Missing SUPABASE_SERVICE_ROLE_KEY — set it in .env.local');
	process.exit(1);
}
if (!GOOGLE_DRIVE_API_KEY) {
	console.error('Missing GOOGLE_DRIVE_API_KEY — set it in .env.local');
	process.exit(1);
}

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterSourceId = args.find((a) => a.startsWith('--source='))?.split('=')[1];
const limitSources = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const skipScryfall = args.includes('--skip-scryfall');
const noFuzzy = !args.includes('--fuzzy'); // fuzzy opt-in only — avoid 429s on large sources
const reEnrich = args.includes('--re-enrich');
const reEnrichDays = parseInt(
	args.find((a) => a.startsWith('--re-enrich-days='))?.split('=')[1] ?? '30',
	10
);
const checkImageHash = args.includes('--check-image-hash');
const mirrorImages = args.includes('--mirror-images');
const reportPath = args.find((a) => a.startsWith('--report='))?.split('=')[1];

// ─── Supabase ───────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface MpcfillSourceRaw {
	pk: number;
	key: string;
	name: string;
	description: string;
	sourceType: string;
	externalLink: string;
}

interface MpcfillSourcesResponse {
	results: Record<string, MpcfillSourceRaw>;
}

interface IngestResult {
	newCount: number;
	skippedCount: number;
	failedCount: number;
	reEnrichedCount: number;
	imagesMirrored: number;
	duplicateImages: number;
	resolvedBySetNum: number;
	resolvedByName: number;
	resolvedByFuzzy: number;
	unresolvedFiles: string[];
	warnings: string[];
}

interface SourceReport {
	sourceId: string;
	resolved: number;
	skipped: number;
	failed: number;
	upserted: number;
	reEnriched: number;
	imagesMirrored: number;
	duplicateImages: number;
	unresolvedFiles: string[];
	warnings: string[];
}

interface RunReport {
	startedAt: string;
	finishedAt: string;
	flags: {
		source?: string;
		limit?: number;
		skipScryfall: boolean;
		fuzzy: boolean;
		reEnrich: boolean;
		reEnrichDays: number;
		checkImageHash: boolean;
		mirrorImages: boolean;
		reportPath?: string;
	};
	sources: SourceReport[];
	totals: Omit<SourceReport, 'sourceId'>;
	warnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DRIVE_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)|\/folders\/([a-zA-Z0-9_-]+)/;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
// eslint-disable-next-line sonarjs/slow-regex
const FOLDER_BRACKET_RE = /\[([^\]]*)\]/gu;
// eslint-disable-next-line sonarjs/slow-regex
const FOLDER_PAREN_RE = /\(([^)]*)\)/gu;
// eslint-disable-next-line sonarjs/slow-regex
const FOLDER_TAG_SPLIT_RE = /\s*,\s*/u;
function extractDriveId(url: string): string | null {
	const m = DRIVE_ID_RE.exec(url);
	return m ? (m[1] ?? m[2] ?? null) : null;
}

function isImageFile(filename: string): boolean {
	const dot = filename.lastIndexOf('.');
	if (dot === -1) return false;
	return IMAGE_EXTENSIONS.has(filename.slice(dot + 1).toLowerCase());
}

function driveImageUrl(fileId: string): string {
	return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600-h840`;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
	const res = await fetch(url);
	if ((res.status === 429 || res.status >= 500) && attempt < 4) {
		const wait = 500 * Math.pow(2, attempt);
		console.warn(`  ⚠ HTTP ${res.status}, retrying in ${wait}ms…`);
		await sleep(wait);
		return fetchWithRetry(url, attempt + 1);
	}
	return res;
}

async function fetchScryfallSetCodes(): Promise<Set<string>> {
	const res = await fetch(SCRYFALL_SETS_URL, { headers: { 'User-Agent': SCRYFALL_USER_AGENT } });
	if (!res.ok) throw new Error(`Scryfall /sets failed: HTTP ${res.status}`);
	const json = (await res.json()) as { data: Array<{ code: string }> };
	return new Set(json.data.map((s) => s.code.toUpperCase()));
}

// ─── Image helpers ──────────────────────────────────────────────────────────

async function fetchImageBytes(fileId: string): Promise<ArrayBuffer | null> {
	try {
		const res = await fetchWithRetry(driveImageUrl(fileId));
		if (!res.ok) return null;
		return await res.arrayBuffer();
	} catch {
		return null;
	}
}

async function computeSHA256Hex(buf: ArrayBuffer): Promise<string> {
	const hashBuf = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(hashBuf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function uploadToStorage(
	sourceKey: string,
	driveFileId: string,
	ext: string,
	bytes: ArrayBuffer
): Promise<string | null> {
	const path = `mpc/${sourceKey}/${driveFileId}.${ext}`;
	const { error } = await supabase.storage
		.from('custom-cards')
		.upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
	if (error) return null;
	return path;
}

// ─── Drive helpers ──────────────────────────────────────────────────────────

interface DriveItem {
	id: string;
	name: string;
	mimeType: string;
}

interface DriveListResponse {
	files: DriveItem[];
	nextPageToken?: string;
}

async function listDriveFolderChildren(folderId: string): Promise<DriveItem[]> {
	const items: DriveItem[] = [];
	let pageToken: string | undefined;

	do {
		const params = new URLSearchParams({
			q: `'${folderId}' in parents`,
			key: GOOGLE_DRIVE_API_KEY,
			pageSize: '1000',
			fields: 'nextPageToken,files(id,name,mimeType)',
			...(pageToken ? { pageToken } : {}),
		});

		const res = await fetchWithRetry(`${DRIVE_FILES_URL}?${params}`);

		// Fatal errors — abort early rather than repeating for every source
		if (res.status === 400 || res.status === 401 || res.status === 403) {
			throw new Error(
				`Drive API fatal error (HTTP ${res.status}) for folder ${folderId} — check GOOGLE_DRIVE_API_KEY permissions`
			);
		}
		if (!res.ok) throw new Error(`Drive list failed for folder ${folderId}: HTTP ${res.status}`);

		const data = (await res.json()) as DriveListResponse;
		items.push(...(data.files ?? []));
		pageToken = data.nextPageToken;
	} while (pageToken);

	return items;
}

interface DriveImageEntry {
	id: string;
	name: string;
	folderPath: string[]; // Folder names from root to immediate parent
}

// Recursively collects all image files under a folder (handles nested subfolders).
// Tracks the folder path so downstream code can infer card_type and folder-level tags.
// Skips folders whose names start with '!' per MPC Autofill spec.
async function listDriveFolder(folderId: string): Promise<DriveImageEntry[]> {
	const images: DriveImageEntry[] = [];
	const queue: Array<{ id: string; path: string[] }> = [{ id: folderId, path: [] }];

	while (queue.length > 0) {
		const { id: currentId, path: currentPath } = queue.shift()!;
		const children = await listDriveFolderChildren(currentId);

		for (const item of children) {
			if (item.mimeType === 'application/vnd.google-apps.folder') {
				if (!item.name.startsWith('!')) {
					queue.push({ id: item.id, path: [...currentPath, item.name] });
				}
			} else if (isImageFile(item.name)) {
				images.push({ id: item.id, name: item.name, folderPath: currentPath });
			}
		}
	}

	return images;
}

function folderPathToMeta(folderPath: string[]): {
	cardType: CardType;
	folderTags: string[];
} {
	let cardType: CardType = 'card';
	const folderTags: string[] = [];

	for (const folderName of folderPath) {
		const lower = folderName.toLowerCase();
		if (lower === 'tokens' || lower.startsWith('tokens ') || lower.startsWith('tokens(')) {
			cardType = 'token';
		} else if (lower === 'cardbacks' || lower.startsWith('cardbacks')) {
			cardType = 'cardback';
		}

		// Extract tags from folder name brackets [...]
		FOLDER_BRACKET_RE.lastIndex = 0;
		for (const m of folderName.matchAll(FOLDER_BRACKET_RE)) {
			const parts = m[1].trim().split(FOLDER_TAG_SPLIT_RE).filter(Boolean);
			folderTags.push(...parts);
		}
		// Extract tags from folder name parens (...)
		FOLDER_PAREN_RE.lastIndex = 0;
		for (const m of folderName.matchAll(FOLDER_PAREN_RE)) {
			const v = m[1].trim();
			if (v && !/^\d+$/u.test(v)) folderTags.push(v);
		}
	}

	return { cardType, folderTags };
}

// ─── Card processing helpers ────────────────────────────────────────────────

interface PendingCard {
	cardId: string;
	file: DriveImageEntry;
	parsed: ReturnType<typeof parseCardFilename>;
	setCode: string | null;
	cardType: CardType;
	allTags: string[];
	isReEnrich: boolean;
	alreadyMirrored: boolean;
}

interface ImageResult {
	imageHash: string | null;
	storagePath: string | null;
	isDuplicate: boolean;
	imagesMirrored: number;
	warnings: string[];
}

async function processCardImage(
	p: PendingCard,
	sourceId: string,
	sourceKey: string
): Promise<ImageResult> {
	const warnings: string[] = [];
	let imageHash: string | null = null;
	let storagePath: string | null = null;
	let imagesMirrored = 0;

	const imageBytes = await fetchImageBytes(p.file.id);
	if (!imageBytes) {
		warnings.push(`Image fetch failed for ${p.cardId}`);
		return { imageHash, storagePath, isDuplicate: false, imagesMirrored, warnings };
	}

	if (checkImageHash) {
		imageHash = await computeSHA256Hex(imageBytes);
		const { data: dup } = await supabase
			.from('custom_cards')
			.select('id')
			.eq('source_id', sourceId)
			.eq('image_hash', imageHash)
			.neq('id', p.cardId)
			.limit(1)
			.maybeSingle();
		if (dup) {
			const msg = `Duplicate image detected for ${p.cardId} (same hash as ${(dup as { id: string }).id})`;
			warnings.push(msg);
			return { imageHash, storagePath, isDuplicate: true, imagesMirrored, warnings };
		}
	}

	if (mirrorImages && !p.alreadyMirrored) {
		const ext = p.parsed.extension ?? 'jpg';
		storagePath = await uploadToStorage(sourceKey, p.file.id, ext, imageBytes);
		if (storagePath) {
			imagesMirrored++;
		} else {
			warnings.push(`Storage upload failed for ${p.cardId}`);
		}
	}

	return { imageHash, storagePath, isDuplicate: false, imagesMirrored, warnings };
}

async function upsertNewCard(
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

async function reEnrichCard(
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

function logScryfallStats(
	prefix: string,
	resolvedBySetNum: number,
	resolvedByName: number,
	resolvedByFuzzy: number,
	unresolvedFiles: string[]
): void {
	console.log(
		`${prefix} — Scryfall: ${resolvedBySetNum} by set+num, ${resolvedByName} by name, ${resolvedByFuzzy} by fuzzy, ${unresolvedFiles.length} unresolved`
	);
	if (unresolvedFiles.length > 0) {
		console.warn(`${prefix} — Unresolved files:`);
		for (const f of unresolvedFiles) console.warn(`    • ${f}`);
	}
}

function buildPendingFromDrive(
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
		if (doneIds.has(cardId) && !(mirrorImages && !alreadyMirrored)) continue;
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

async function fetchStaleCards(
	sourceId: string,
	validSetCodes: Set<string>
): Promise<PendingCard[]> {
	const threshold = new Date(Date.now() - reEnrichDays * 86_400_000).toISOString();
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

// ─── Main pipeline ──────────────────────────────────────────────────────────

async function fetchSources(): Promise<MpcfillSourceRaw[]> {
	const res = await fetchWithRetry(MPCFILL_URL);
	if (!res.ok) throw new Error(`mpcfill fetch failed: HTTP ${res.status}`);
	const data = (await res.json()) as MpcfillSourcesResponse;
	return Object.values(data.results ?? {}).filter((s) => s.sourceType === 'Google Drive');
}

async function ingestSource(
	source: MpcfillSourceRaw,
	driveId: string,
	index: number,
	total: number,
	validSetCodes: Set<string>
): Promise<IngestResult> {
	const sourceId = `mpcfill:${source.key}`;
	const prefix = `[source ${index}/${total}] ${sourceId}`;
	const warnings: string[] = [];

	if (reEnrich && skipScryfall) {
		warnings.push('--re-enrich ignoré car --skip-scryfall actif');
	}

	// Upsert source row
	const { error: srcErr } = await supabase.from('custom_card_sources').upsert({
		id: sourceId,
		name: source.name,
		description: source.description || null,
		provider: 'mpcfill',
		external_link: source.externalLink || null,
		drive_folder_id: driveId,
		tags: ['mpcfill', source.key],
	});
	if (srcErr) throw new Error(`Source upsert failed: ${srcErr.message}`);

	// List Drive files
	let files: DriveImageEntry[];
	try {
		files = await listDriveFolder(driveId);
	} catch (err) {
		const msg = `Drive list failed: ${(err as Error).message}, skipping`;
		warnings.push(msg);
		console.warn(`${prefix} — ⚠ ${msg}`);
		return {
			newCount: 0,
			skippedCount: 0,
			failedCount: 1,
			reEnrichedCount: 0,
			imagesMirrored: 0,
			duplicateImages: 0,
			resolvedBySetNum: 0,
			resolvedByName: 0,
			resolvedByFuzzy: 0,
			unresolvedFiles: [],
			warnings,
		};
	}

	console.log(`${prefix} — ${files.length} images found`);

	// Check existing cards — select id + image_storage_path when mirroring
	const existingSelect = mirrorImages ? 'id, image_storage_path' : 'id';
	const { data: existing } = await supabase
		.from('custom_cards')
		.select(existingSelect)
		.eq('source_id', sourceId)
		.limit(100_000);

	if ((existing?.length ?? 0) >= 100_000) {
		const msg = 'existing cards query may be truncated (≥100k rows)';
		warnings.push(msg);
		console.warn(`${prefix} — ⚠ ${msg}`);
	}

	type ExistingRow = { id: string; image_storage_path?: string | null };
	const existingRows = (existing ?? []) as unknown as ExistingRow[];
	const doneIds = new Set(existingRows.map((r) => r.id));
	const mirroredIds = mirrorImages
		? new Set(existingRows.filter((r) => r.image_storage_path).map((r) => r.id))
		: new Set<string>();

	// ── Phase 1: parse filenames, prepare card rows ─────────────────────────
	const skippedCount = files.filter((f) => doneIds.has(`mpc:${f.id}`) && !mirrorImages).length;
	const pending = buildPendingFromDrive(files, doneIds, mirroredIds, sourceId, validSetCodes);
	const staleCards =
		reEnrich && !skipScryfall ? await fetchStaleCards(sourceId, validSetCodes) : [];
	const allPending = [...pending, ...staleCards];

	// ── Phase 2: batch Scryfall resolution ──────────────────────────────────
	let resolutions = new Map<string, ScryfallResolution>();

	if (!skipScryfall && allPending.length > 0) {
		const cardsToResolve: CardToResolve[] = allPending.map((p) => ({
			id: p.cardId,
			parsed: p.parsed,
			cardType: p.cardType,
			validSetCode: p.setCode,
		}));
		resolutions = await resolveBatch(cardsToResolve, { fuzzy: !noFuzzy });
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

				if (!skipScryfall && !p.isReEnrich) {
					if (resolution?.strategy === 'set_num') resolvedBySetNum++;
					else if (resolution?.strategy === 'name') resolvedByName++;
					else if (resolution?.strategy === 'fuzzy') resolvedByFuzzy++;
					else unresolvedFiles.push(p.file.name);
				}

				if (p.isReEnrich) {
					const { error } = await reEnrichCard(p.cardId, resolution);
					if (error) {
						const msg = `Re-enrich update failed for ${p.cardId}: ${error}`;
						warnings.push(msg);
						failedCount++;
						return;
					}
					reEnrichedCount++;
					return;
				}

				let imageHash: string | null = null;
				let storagePath: string | null = null;
				if (checkImageHash || mirrorImages) {
					const img = await processCardImage(p, sourceId, source.key);
					warnings.push(...img.warnings);
					if (img.isDuplicate) {
						duplicateImages++;
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
					console.warn(`  ⚠ ${msg}`);
					failedCount++;
					return;
				}
				newCount++;
			})
		)
	);

	const { count: realCount } = await supabase
		.from('custom_cards')
		.select('*', { count: 'exact', head: true })
		.eq('source_id', sourceId)
		.eq('is_public', true);

	const { error: countErr } = await supabase
		.from('custom_card_sources')
		.update({ card_count: realCount ?? 0, last_synced_at: new Date().toISOString() })
		.eq('id', sourceId);
	if (countErr) {
		const msg = `card_count update failed: ${countErr.message}`;
		warnings.push(msg);
		console.warn(`${prefix} — ⚠ ${msg}`);
	}

	console.log(
		`${prefix} — ✓ ${newCount} new, ${skippedCount} skipped, ${failedCount} failed` +
			(reEnrichedCount ? `, ${reEnrichedCount} re-enriched` : '') +
			(imagesMirrored ? `, ${imagesMirrored} mirrored` : '') +
			(duplicateImages ? `, ${duplicateImages} duplicate images` : '')
	);
	if (!skipScryfall) {
		logScryfallStats(prefix, resolvedBySetNum, resolvedByName, resolvedByFuzzy, unresolvedFiles);
	}

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

async function main(): Promise<void> {
	const startedAt = new Date().toISOString();
	const runWarnings: string[] = [];

	console.log('Fetching sources from mpcfill.com…');
	const [rawSources, validSetCodes] = await Promise.all([
		fetchSources(),
		skipScryfall ? Promise.resolve(new Set<string>()) : fetchScryfallSetCodes(),
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

	let filtered = filterSourceId
		? sources.filter((s) => `mpcfill:${s.raw.key}` === filterSourceId)
		: sources;

	if (limitSources > 0) filtered = filtered.slice(0, limitSources);

	if (filterSourceId && filtered.length === 0) {
		console.error(`Source not found: ${filterSourceId}`);
		process.exit(1);
	}

	if (skipScryfall) console.log('ℹ Scryfall enrichment skipped (--skip-scryfall)\n');
	if (reEnrich && !skipScryfall)
		console.log(`ℹ Re-enrichment active — cards older than ${reEnrichDays} days will be updated\n`);

	console.log(`Processing ${filtered.length} sources…\n`);

	// Scryfall uses a global serialized throttle queue — running sources in
	// parallel injects concurrent batch calls that overwhelm the 10 req/s limit.
	// With Scryfall active, process one source at a time.
	const sourceConcurrency = skipScryfall ? 5 : 1;
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
			unresolvedFiles: [...acc.unresolvedFiles, ...s.unresolvedFiles],
			warnings: [...acc.warnings, ...s.warnings],
		}),
		zeroTotals
	);

	const report: RunReport = {
		startedAt,
		finishedAt,
		flags: {
			...(filterSourceId ? { source: filterSourceId } : {}),
			...(limitSources > 0 ? { limit: limitSources } : {}),
			skipScryfall,
			fuzzy: !noFuzzy,
			reEnrich,
			reEnrichDays,
			checkImageHash,
			mirrorImages,
			...(reportPath ? { reportPath } : {}),
		},
		sources: sourceReports,
		totals,
		warnings: runWarnings,
	};

	const reportJson = JSON.stringify(report, null, 2);
	console.log('\n✅ Ingestion complete.\n');
	console.log(reportJson);

	if (reportPath) {
		await writeFile(reportPath, reportJson, 'utf-8');
		console.log(`\nReport written to ${reportPath}`);
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
