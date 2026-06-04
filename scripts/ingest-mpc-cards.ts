import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { parseCardFilename } from '../src/lib/mpc/parse-filename';

// ─── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY ?? '';
const MPCFILL_URL = 'https://mpcfill.com/2/sources/';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const SCRYFALL_BATCH_SIZE = 75;

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

interface ScryfallCardMinimal {
	oracle_id: string;
	name: string;
}

interface ScryfallSingleCard {
	oracle_id?: string;
}

interface ScryfallCollectionResponse {
	data: ScryfallCardMinimal[];
	not_found: Array<{ name: string }>;
}

interface IngestResult {
	newCount: number;
	skippedCount: number;
	failedCount: number;
	scryfallMatched: number;
	scryfallUnmatched: number;
	scryfallFailed: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DRIVE_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)|\/folders\/([a-zA-Z0-9_-]+)/;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
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
	return `https://drive.usercontent.google.com/download?id=${fileId}&export=view`;
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

// ─── Scryfall throttle ──────────────────────────────────────────────────────

let lastScryfallCall = 0;

async function scryfallPost<T>(body: object): Promise<T> {
	const elapsed = Date.now() - lastScryfallCall;
	if (elapsed < 100) await sleep(100 - elapsed);
	lastScryfallCall = Date.now();

	const res = await fetch(SCRYFALL_COLLECTION_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'Wizcard/1.0',
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) throw new Error(`Scryfall collection POST failed: HTTP ${res.status}`);
	return res.json() as Promise<T>;
}

async function scryfallGet<T>(path: string): Promise<T | null> {
	const elapsed = Date.now() - lastScryfallCall;
	if (elapsed < 100) await sleep(100 - elapsed);
	lastScryfallCall = Date.now();

	const res = await fetch(`https://api.scryfall.com${path}`, {
		headers: { 'User-Agent': 'Wizcard/1.0' },
	});

	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Scryfall GET ${path} failed: HTTP ${res.status}`);
	return res.json() as Promise<T>;
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

// Recursively collects all image files under a folder (handles nested subfolders)
async function listDriveFolder(folderId: string): Promise<Array<{ id: string; name: string }>> {
	const images: Array<{ id: string; name: string }> = [];
	const queue: string[] = [folderId];

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		const children = await listDriveFolderChildren(currentId);

		for (const item of children) {
			if (item.mimeType === 'application/vnd.google-apps.folder') {
				queue.push(item.id);
			} else if (isImageFile(item.name)) {
				images.push({ id: item.id, name: item.name });
			}
		}
	}

	return images;
}

// ─── Scryfall enrichment ────────────────────────────────────────────────────

async function applyScryfallBatch(
	batch: string[],
	nameToIds: Map<string, string[]>,
	prefix: string
): Promise<{ matched: number; unmatched: number; failed: number }> {
	let result: ScryfallCollectionResponse;
	try {
		result = await scryfallPost<ScryfallCollectionResponse>({
			identifiers: batch.map((name) => ({ name })),
		});
	} catch (err) {
		console.warn(`${prefix} — ⚠ Scryfall batch failed: ${(err as Error).message}`);
		return { matched: 0, unmatched: 0, failed: batch.length };
	}

	const foundByName = new Map<string, string>();
	for (const card of result.data ?? []) {
		foundByName.set(card.name.toLowerCase(), card.oracle_id);
	}

	let matched = 0;
	let unmatched = 0;
	const now = new Date().toISOString();

	for (const name of batch) {
		const oracleId = foundByName.get(name.toLowerCase());
		const cardIds = nameToIds.get(name) ?? [];

		if (oracleId) {
			for (const cardId of cardIds) {
				const { error: upsertErr } = await supabase
					.from('custom_cards')
					.update({ oracle_id: oracleId, enriched_at: now })
					.eq('id', cardId);
				if (upsertErr) {
					console.warn(`${prefix} — ⚠ oracle_id update failed for ${cardId}: ${upsertErr.message}`);
				}
			}
			matched++;
		} else {
			unmatched++;
		}
	}

	return { matched, unmatched, failed: 0 };
}

async function enrichBySetAndNumber(
	sourceId: string,
	prefix: string
): Promise<{ matched: number }> {
	const { data: candidates, error } = await supabase
		.from('custom_cards')
		.select('id, set_code, collector_number')
		.eq('source_id', sourceId)
		.is('enriched_at', null)
		.not('set_code', 'is', null)
		.not('collector_number', 'is', null)
		.limit(100_000);

	if (error || !candidates || candidates.length === 0) {
		return { matched: 0 };
	}

	let matched = 0;
	const now = new Date().toISOString();

	const strategyALimiter = pLimit(5);
	await Promise.all(
		candidates.map((card) =>
			strategyALimiter(async () => {
				if (!card.set_code || !card.collector_number) return;
				const path = `/cards/${encodeURIComponent(card.set_code.toLowerCase())}/${encodeURIComponent(card.collector_number)}`;
				let result: ScryfallSingleCard | null = null;
				try {
					result = await scryfallGet<ScryfallSingleCard>(path);
				} catch (err) {
					console.warn(
						`${prefix} — ⚠ Strategy A GET failed for ${card.id}: ${(err as Error).message}`
					);
				}

				if (result?.oracle_id) {
					const { error: updateErr } = await supabase
						.from('custom_cards')
						.update({ oracle_id: result.oracle_id, enriched_at: now })
						.eq('id', card.id);
					if (updateErr) {
						console.warn(
							`${prefix} — ⚠ oracle_id update failed for ${card.id}: ${updateErr.message}`
						);
					} else {
						matched++;
					}
				}
			})
		)
	);

	if (matched > 0) console.log(`${prefix} — Strategy A: ${matched} matched by set+num`);

	return { matched };
}

async function enrichSourceWithScryfall(
	sourceId: string,
	prefix: string
): Promise<{ matched: number; unmatched: number; failed: number }> {
	// Strategy A: set + collector_number lookup
	const { matched: matchedA } = await enrichBySetAndNumber(sourceId, prefix);

	// Strategy B: batch name lookup for everything still unenriched
	const { data: unenriched, error } = await supabase
		.from('custom_cards')
		.select('id, name')
		.eq('source_id', sourceId)
		.is('enriched_at', null)
		.limit(100_000);

	if (error) {
		console.warn(`${prefix} — ⚠ Scryfall enrichment query failed: ${error.message}`);
		return { matched: matchedA, unmatched: 0, failed: 0 };
	}

	if (!unenriched || unenriched.length === 0) {
		return { matched: matchedA, unmatched: 0, failed: 0 };
	}

	const nameToIds = new Map<string, string[]>();
	for (const card of unenriched) {
		const existing = nameToIds.get(card.name);
		if (existing) existing.push(card.id);
		else nameToIds.set(card.name, [card.id]);
	}

	const uniqueNames = Array.from(nameToIds.keys());
	let matchedB = 0;
	let unmatched = 0;
	let failed = 0;

	for (let i = 0; i < uniqueNames.length; i += SCRYFALL_BATCH_SIZE) {
		const batch = uniqueNames.slice(i, i + SCRYFALL_BATCH_SIZE);
		const r = await applyScryfallBatch(batch, nameToIds, prefix);
		matchedB += r.matched;
		unmatched += r.unmatched;
		failed += r.failed;
	}

	return { matched: matchedA + matchedB, unmatched, failed };
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
	total: number
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
	let files: Array<{ id: string; name: string }>;
	try {
		files = await listDriveFolder(driveId);
	} catch (err) {
		console.warn(`${prefix} — ⚠ Drive list failed: ${(err as Error).message}, skipping`);
		return {
			newCount: 0,
			skippedCount: 0,
			failedCount: 1,
			scryfallMatched: 0,
			scryfallUnmatched: 0,
			scryfallFailed: 0,
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

	let newCount = 0;
	let skippedCount = 0;
	let failedCount = 0;

	const limiter = pLimit(20);
	await Promise.all(
		files.map((file) =>
			limiter(async () => {
				const cardId = `mpc:${file.id}`;
				if (doneIds.has(cardId)) {
					skippedCount++;
					return;
				}

				const parsed = parseCardFilename(file.name);
				const { error: cardErr } = await supabase.from('custom_cards').upsert({
					id: cardId,
					source_id: sourceId,
					name: parsed.cardName,
					raw_name: file.name,
					set_code: parsed.bracketTags[0] ?? null,
					collector_number: parsed.collectorNumber,
					variants: parsed.variants,
					image_drive_url: driveImageUrl(file.id),
					tags: ['custom:mpc', `mpc-source:${sourceId}`],
					is_public: true,
				});

				if (cardErr) {
					console.warn(`  ⚠ Card upsert failed for ${cardId}: ${cardErr.message}`);
					failedCount++;
					return;
				}

				newCount++;
			})
		)
	);

	// Update card_count with the real count from DB (not just this session's counts)
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

	console.log(
		`${prefix} — ✓ images done (${newCount} new, ${skippedCount} skipped, ${failedCount} failed)`
	);

	// Scryfall enrichment
	let scryfallMatched = 0;
	let scryfallUnmatched = 0;
	let scryfallFailed = 0;

	if (!skipScryfall) {
		const enrichResult = await enrichSourceWithScryfall(sourceId, prefix);
		scryfallMatched = enrichResult.matched;
		scryfallUnmatched = enrichResult.unmatched;
		scryfallFailed = enrichResult.failed;
		console.log(
			`${prefix} — ✓ scryfall (${scryfallMatched} matched, ${scryfallUnmatched} unmatched, ${scryfallFailed} failed)`
		);
	}

	return {
		newCount,
		skippedCount,
		failedCount,
		scryfallMatched,
		scryfallUnmatched,
		scryfallFailed,
	};
}

async function main(): Promise<void> {
	console.log('Fetching sources from mpcfill.com…');
	const rawSources = await fetchSources();

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

	const sourceLimiter = pLimit(5);
	const results = await Promise.all(
		filtered.map(({ raw, driveId }, i) =>
			sourceLimiter(() => ingestSource(raw, driveId, i + 1, filtered.length))
		)
	);

	const totals = results.reduce(
		(acc, r) => ({
			newCount: acc.newCount + r.newCount,
			skippedCount: acc.skippedCount + r.skippedCount,
			failedCount: acc.failedCount + r.failedCount,
			scryfallMatched: acc.scryfallMatched + r.scryfallMatched,
			scryfallUnmatched: acc.scryfallUnmatched + r.scryfallUnmatched,
			scryfallFailed: acc.scryfallFailed + r.scryfallFailed,
		}),
		{
			newCount: 0,
			skippedCount: 0,
			failedCount: 0,
			scryfallMatched: 0,
			scryfallUnmatched: 0,
			scryfallFailed: 0,
		}
	);

	const sourcesOk = results.filter(
		(r) => r.newCount + r.skippedCount > 0 || r.failedCount === 0
	).length;
	const sourcesFailed = filtered.length - sourcesOk;

	console.log('\n✅ Ingestion complete.');
	console.log(`   Sources processed : ${sourcesOk}`);
	if (sourcesFailed > 0) console.log(`   Sources failed    : ${sourcesFailed}`);
	console.log(`   Cards new         : ${totals.newCount}`);
	console.log(`   Cards skipped     : ${totals.skippedCount}`);
	if (totals.failedCount > 0) console.log(`   Cards failed      : ${totals.failedCount}`);
	if (!skipScryfall) {
		console.log(`   Scryfall matched  : ${totals.scryfallMatched}`);
		if (totals.scryfallUnmatched > 0)
			console.log(`   Scryfall unmatched: ${totals.scryfallUnmatched}`);
		if (totals.scryfallFailed > 0) console.log(`   Scryfall failed   : ${totals.scryfallFailed}`);
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
