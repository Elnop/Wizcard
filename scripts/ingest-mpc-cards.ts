import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

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
	resolvedBySetNum: number;
	resolvedByName: number;
	resolvedByFuzzy: number;
	unresolvedFiles: string[];
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
		console.warn(`${prefix} — ⚠ Drive list failed: ${(err as Error).message}, skipping`);
		return {
			newCount: 0,
			skippedCount: 0,
			failedCount: 1,
			resolvedBySetNum: 0,
			resolvedByName: 0,
			resolvedByFuzzy: 0,
			unresolvedFiles: [],
		};
	}

	console.log(`${prefix} — ${files.length} images found`);

	// Check existing cards to skip already-done
	const { data: existing } = await supabase
		.from('custom_cards')
		.select('id')
		.eq('source_id', sourceId)
		.limit(100_000);

	if ((existing?.length ?? 0) >= 100_000) {
		console.warn(`${prefix} — ⚠ existing cards query may be truncated (≥100k rows)`);
	}

	const doneIds = new Set((existing ?? []).map((r) => r.id));

	// ── Phase 1: parse filenames, prepare card rows ─────────────────────────
	interface PendingCard {
		cardId: string;
		file: DriveImageEntry;
		parsed: ReturnType<typeof parseCardFilename>;
		setCode: string | null;
		cardType: CardType;
		allTags: string[];
	}

	const skippedCount = files.filter((f) => doneIds.has(`mpc:${f.id}`)).length;
	const pending: PendingCard[] = [];

	for (const file of files) {
		const cardId = `mpc:${file.id}`;
		if (doneIds.has(cardId)) continue;
		const parsed = parseCardFilename(file.name);
		const setCode = parsed.setCode && validSetCodes.has(parsed.setCode) ? parsed.setCode : null;
		const { cardType, folderTags } = folderPathToMeta(file.folderPath);
		const allTags = ['custom:mpc', `mpc-source:${sourceId}`, ...folderTags, ...parsed.bracketTags];
		pending.push({ cardId, file, parsed, setCode, cardType, allTags });
	}

	// ── Phase 2: batch Scryfall resolution ──────────────────────────────────
	let resolutions = new Map<string, ScryfallResolution>();

	if (!skipScryfall && pending.length > 0) {
		const cardsToResolve: CardToResolve[] = pending.map((p) => ({
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
	let resolvedBySetNum = 0;
	let resolvedByName = 0;
	let resolvedByFuzzy = 0;
	const unresolvedFiles: string[] = [];

	const limiter = pLimit(20);
	await Promise.all(
		pending.map((p) =>
			limiter(async () => {
				const resolution = resolutions.get(p.cardId) ?? null;

				if (!skipScryfall) {
					if (resolution?.strategy === 'set_num') resolvedBySetNum++;
					else if (resolution?.strategy === 'name') resolvedByName++;
					else if (resolution?.strategy === 'fuzzy') resolvedByFuzzy++;
					else unresolvedFiles.push(p.file.name);
				}

				const { error: cardErr } = await supabase.from('custom_cards').upsert({
					id: p.cardId,
					source_id: sourceId,
					name: resolution?.oracleName ?? p.parsed.cardName,
					display_name: p.parsed.cardName,
					raw_name: p.file.name,
					set_code: p.setCode,
					collector_number: p.setCode ? p.parsed.collectorNumber : null,
					variants: p.parsed.variants,
					image_drive_url: driveImageUrl(p.file.id),
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

				if (cardErr) {
					console.warn(`  ⚠ Card upsert failed for ${p.cardId}: ${cardErr.message}`);
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
	if (countErr) console.warn(`${prefix} — ⚠ card_count update failed: ${countErr.message}`);

	console.log(`${prefix} — ✓ ${newCount} new, ${skippedCount} skipped, ${failedCount} failed`);
	if (!skipScryfall) {
		console.log(
			`${prefix} — Scryfall: ${resolvedBySetNum} by set+num, ${resolvedByName} by name, ${resolvedByFuzzy} by fuzzy, ${unresolvedFiles.length} unresolved`
		);
		if (unresolvedFiles.length > 0) {
			console.warn(`${prefix} — Unresolved files:`);
			for (const f of unresolvedFiles) console.warn(`    • ${f}`);
		}
	}

	return {
		newCount,
		skippedCount,
		failedCount,
		resolvedBySetNum,
		resolvedByName,
		resolvedByFuzzy,
		unresolvedFiles,
	};
}

async function main(): Promise<void> {
	console.log('Fetching sources from mpcfill.com…');
	const [rawSources, validSetCodes] = await Promise.all([
		fetchSources(),
		skipScryfall ? Promise.resolve(new Set<string>()) : fetchScryfallSetCodes(),
	]);
	console.log(`  ✓ ${validSetCodes.size} Scryfall set codes loaded`);

	const sources = rawSources.flatMap((s) => {
		const driveId = extractDriveId(s.externalLink);
		if (!driveId) {
			console.warn(`  ⚠ No Drive ID found for source "${s.key}" — externalLink: ${s.externalLink}`);
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

	const totals = results.reduce(
		(acc, r) => ({
			newCount: acc.newCount + r.newCount,
			skippedCount: acc.skippedCount + r.skippedCount,
			failedCount: acc.failedCount + r.failedCount,
			resolvedBySetNum: acc.resolvedBySetNum + r.resolvedBySetNum,
			resolvedByName: acc.resolvedByName + r.resolvedByName,
			resolvedByFuzzy: acc.resolvedByFuzzy + r.resolvedByFuzzy,
			unresolvedFiles: [...acc.unresolvedFiles, ...r.unresolvedFiles],
		}),
		{
			newCount: 0,
			skippedCount: 0,
			failedCount: 0,
			resolvedBySetNum: 0,
			resolvedByName: 0,
			resolvedByFuzzy: 0,
			unresolvedFiles: [] as string[],
		}
	);

	const sourcesOk = results.filter(
		(r) => r.newCount + r.skippedCount > 0 || r.failedCount === 0
	).length;
	const sourcesFailed = filtered.length - sourcesOk;

	console.log('\n✅ Ingestion complete.');
	console.log(`   Sources processed  : ${sourcesOk}`);
	if (sourcesFailed > 0) console.log(`   Sources failed     : ${sourcesFailed}`);
	console.log(`   Cards new          : ${totals.newCount}`);
	console.log(`   Cards skipped      : ${totals.skippedCount}`);
	if (totals.failedCount > 0) console.log(`   Cards failed       : ${totals.failedCount}`);
	if (!skipScryfall) {
		console.log(`   Resolved set+num   : ${totals.resolvedBySetNum}`);
		console.log(`   Resolved by name   : ${totals.resolvedByName}`);
		if (totals.resolvedByFuzzy > 0)
			console.log(`   Resolved by fuzzy  : ${totals.resolvedByFuzzy}`);
		if (totals.unresolvedFiles.length > 0)
			console.warn(`   ⚠ Unresolved total : ${totals.unresolvedFiles.length}`);
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
