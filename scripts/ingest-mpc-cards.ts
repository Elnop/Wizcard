import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';

// ─── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY ?? '';
const MPCFILL_URL = 'https://mpcfill.com/2/sources/';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}
if (!GOOGLE_DRIVE_API_KEY) {
	console.error('Missing GOOGLE_DRIVE_API_KEY');
	process.exit(1);
}

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterSourceId = args.find((a) => a.startsWith('--source='))?.split('=')[1];
const limitSources = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

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

interface DriveFilesResponse {
	files: Array<{ id: string; name: string }>;
	nextPageToken?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DRIVE_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)|\/folders\/([a-zA-Z0-9_-]+)/;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const KNOWN_SUFFIXES = [
	'Extended',
	'Borderless',
	'Alt Art',
	'Showcase',
	'Retro',
	'Promo',
	'Foil',
	'Etched',
	'Full Art',
];

function extractDriveId(url: string): string | null {
	const m = DRIVE_ID_RE.exec(url);
	return m ? (m[1] ?? m[2] ?? null) : null;
}

function normalizeName(filename: string): string {
	const dot = filename.lastIndexOf('.');
	let name = dot !== -1 ? filename.slice(0, dot) : filename;
	for (const suffix of KNOWN_SUFFIXES) {
		name = name.replace(` (${suffix})`, '').replace(` (${suffix.toLowerCase()})`, '');
	}
	return name.trim();
}

function isImageFile(filename: string): boolean {
	const dot = filename.lastIndexOf('.');
	if (dot === -1) return false;
	return IMAGE_EXTENSIONS.has(filename.slice(dot + 1).toLowerCase());
}

function getExtension(filename: string): string {
	const dot = filename.lastIndexOf('.');
	return dot !== -1 ? filename.slice(dot + 1).toLowerCase() : 'jpg';
}

function driveThumbUrl(fileId: string): string {
	return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
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

// ─── Drive helpers ──────────────────────────────────────────────────────────

async function listDriveFolder(folderId: string): Promise<Array<{ id: string; name: string }>> {
	const files: Array<{ id: string; name: string }> = [];
	let pageToken: string | undefined;

	do {
		const params = new URLSearchParams({
			q: `'${folderId}' in parents and mimeType contains 'image/'`,
			key: GOOGLE_DRIVE_API_KEY,
			pageSize: '1000',
			fields: 'nextPageToken,files(id,name)',
			...(pageToken ? { pageToken } : {}),
		});

		const res = await fetchWithRetry(`${DRIVE_FILES_URL}?${params}`);
		if (!res.ok) {
			throw new Error(`Drive list failed for folder ${folderId}: HTTP ${res.status}`);
		}
		const data = (await res.json()) as DriveFilesResponse;
		files.push(...(data.files ?? []));
		pageToken = data.nextPageToken;
	} while (pageToken);

	return files.filter((f) => isImageFile(f.name));
}

async function downloadDriveFile(fileId: string): Promise<Buffer> {
	const params = new URLSearchParams({ key: GOOGLE_DRIVE_API_KEY, alt: 'media' });
	const res = await fetchWithRetry(`${DRIVE_FILES_URL}/${fileId}?${params}`);
	if (!res.ok) throw new Error(`Drive download failed for ${fileId}: HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
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
): Promise<void> {
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
		return;
	}

	console.log(`${prefix} — ${files.length} images found`);

	// Check existing cards to skip already-done
	const { data: existing } = await supabase
		.from('custom_cards')
		.select('id, image_storage_path')
		.eq('source_id', sourceId)
		.limit(100_000);

	const doneIds = new Set(
		(existing ?? []).filter((r) => r.image_storage_path != null).map((r) => r.id)
	);

	let newCount = 0;
	let skippedCount = 0;

	const limiter = pLimit(10);
	await Promise.all(
		files.map((file) =>
			limiter(async () => {
				const cardId = `mpc:${file.id}`;
				if (doneIds.has(cardId)) {
					skippedCount++;
					return;
				}

				const ext = getExtension(file.name);
				const storagePath = `${sourceId}/${file.id}.${ext}`;

				let imageBuffer: Buffer;
				try {
					imageBuffer = await downloadDriveFile(file.id);
				} catch (err) {
					console.warn(`  ⚠ Download failed for ${file.id}: ${(err as Error).message}`);
					return;
				}

				const { error: uploadErr } = await supabase.storage
					.from('custom-cards')
					.upload(storagePath, imageBuffer, {
						contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
						upsert: true,
					});

				if (uploadErr) {
					console.warn(`  ⚠ Storage upload failed for ${file.id}: ${uploadErr.message}`);
					return;
				}

				const { error: cardErr } = await supabase.from('custom_cards').upsert({
					id: cardId,
					source_id: sourceId,
					name: normalizeName(file.name),
					raw_name: file.name,
					image_storage_path: storagePath,
					image_drive_url: driveThumbUrl(file.id),
					tags: ['custom:mpc', `mpc-source:${sourceId}`],
					is_public: true,
				});

				if (cardErr) {
					console.warn(`  ⚠ Card upsert failed for ${cardId}: ${cardErr.message}`);
					return;
				}

				newCount++;
			})
		)
	);

	// Update card_count and last_synced_at
	const { error: countErr } = await supabase
		.from('custom_card_sources')
		.update({
			card_count: newCount + skippedCount,
			last_synced_at: new Date().toISOString(),
		})
		.eq('id', sourceId);
	if (countErr) console.warn(`${prefix} — ⚠ card_count update failed: ${countErr.message}`);

	console.log(`${prefix} — ✓ done (${newCount} new, ${skippedCount} skipped)`);
}

async function main(): Promise<void> {
	console.log('Fetching sources from mpcfill.com…');
	const rawSources = await fetchSources();

	const sources = rawSources.flatMap((s) => {
		const driveId = extractDriveId(s.externalLink);
		if (!driveId) return [];
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

	console.log(`Processing ${filtered.length} sources…\n`);

	const sourceLimiter = pLimit(5);
	await Promise.all(
		filtered.map(({ raw, driveId }, i) =>
			sourceLimiter(() => ingestSource(raw, driveId, i + 1, filtered.length))
		)
	);

	console.log('\n✅ Ingestion complete.');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
