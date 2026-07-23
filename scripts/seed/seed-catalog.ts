// Two-pass streaming seed of the Scryfall card catalog from the all_cards bulk.
// all_cards (not default_cards) is the only bulk that contains non-English prints:
// default_cards is "English or the printed language if the card is only available in
// one language", so it holds ~no French prints of normal cards. We need EN + FR, so
// all_cards (~2.5 GB, every card in every language) is the source; toCatalogRows
// filters to lang in {en,fr} + paper.
// Pass 1 (this file): explode each kept card into card_definitions / card_prints /
// card_faces. Pass 2 (added in the next task) resolves all_parts into card_parts.
//
//   npm run seed:catalog                 -- seed against $SUPABASE_URL
//   npm run seed:catalog -- --dry-run    -- normalize/count without writing
//   npm run seed:catalog -- --limit=N    -- stop after N kept cards
//
// Streams the bulk (never buffers the whole file). Writes via the service-role key.

import { createInterface } from 'node:readline';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
	toCatalogRows,
	type CardDefinitionRow,
	type CardPrintRow,
	type CardFaceRow,
} from './normalize-catalog-card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BULK_META_URL = 'https://api.scryfall.com/bulk-data';
const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';
const UPSERT_BATCH = 500;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 0;

if (!SUPABASE_SERVICE_ROLE_KEY && !dryRun) {
	console.error('✖ Missing SUPABASE_SERVICE_ROLE_KEY (required unless --dry-run)');
	process.exit(1);
}

let _sb: SupabaseClient | null = null;
function sb() {
	if (!_sb)
		_sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false },
		});
	return _sb;
}

async function bulkUrl(type: string): Promise<string> {
	const res = await fetch(BULK_META_URL, {
		headers: { 'User-Agent': UA, Accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`GET /bulk-data failed: HTTP ${res.status}`);
	const json = (await res.json()) as {
		data: Array<{ type: string; download_uri: string; size: number }>;
	};
	const entry = json.data.find((b) => b.type === type);
	if (!entry) throw new Error(`${type} entry not found in /bulk-data`);
	console.log(`ℹ ${type}: ${(entry.size / 1e6).toFixed(0)} MB — ${entry.download_uri}`);
	return entry.download_uri;
}

async function openBulkLines(url: string) {
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok || !res.body) throw new Error(`bulk download failed: HTTP ${res.status}`);
	const { Readable } = await import('node:stream');
	const nodeStream = Readable.fromWeb(res.body as never);
	return createInterface({ input: nodeStream, crlfDelay: Infinity });
}

function parseLine(line: string): ScryfallCard | null {
	const trimmed = line.trim().replace(/,$/, '');
	if (trimmed === '' || trimmed === '[' || trimmed === ']') return null;
	try {
		return JSON.parse(trimmed) as ScryfallCard;
	} catch {
		return null;
	}
}

async function flushDefs(rows: CardDefinitionRow[]) {
	if (rows.length === 0 || dryRun) return;
	// Multiple prints (e.g. en + fr) of the same card share one oracle_id and produce
	// identical definition rows (definitions carry the oracle-level name/type_line,
	// not printed_name) — dedupe per batch or Postgres rejects the upsert with
	// "ON CONFLICT DO UPDATE command cannot affect row a second time".
	const byOracleId = new Map(rows.map((r) => [r.oracle_id, r]));
	const { error } = await sb()
		.from('card_definitions')
		.upsert([...byOracleId.values()], { onConflict: 'oracle_id' });
	if (error) throw new Error(`card_definitions upsert failed: ${error.message}`);
}
async function flushPrints(rows: CardPrintRow[]) {
	if (rows.length === 0 || dryRun) return;
	const { error } = await sb().from('card_prints').upsert(rows, { onConflict: 'id' });
	if (error) throw new Error(`card_prints upsert failed: ${error.message}`);
}
const DELETE_CHUNK = 100; // .in() is a GET-style query string; UPSERT_BATCH-sized UUID lists overflow URL length limits

async function flushFaces(printIds: string[], rows: CardFaceRow[]) {
	if (dryRun) return;
	// Replace faces for the prints in this batch: delete then insert (a print's face
	// set is small and fully known here). Chunk the delete: a full UPSERT_BATCH (500)
	// of UUIDs in one `.in()` overflows PostgREST/kong's URL length limit ("URI too long").
	for (let i = 0; i < printIds.length; i += DELETE_CHUNK) {
		const chunk = printIds.slice(i, i + DELETE_CHUNK);
		if (chunk.length === 0) continue;
		const { error: delErr } = await sb().from('card_faces').delete().in('print_id', chunk);
		if (delErr) throw new Error(`card_faces delete failed: ${delErr.message}`);
	}
	if (rows.length > 0) {
		const { error } = await sb().from('card_faces').insert(rows);
		if (error) throw new Error(`card_faces insert failed: ${error.message}`);
	}
}

async function pass1(): Promise<void> {
	const url = await bulkUrl('all_cards');
	const rl = await openBulkLines(url);

	let seen = 0;
	let kept = 0;
	let defs: CardDefinitionRow[] = [];
	let prints: CardPrintRow[] = [];
	let faces: CardFaceRow[] = [];
	let facePrintIds: string[] = [];

	async function flushAll() {
		await flushDefs(defs);
		await flushPrints(prints);
		await flushFaces(facePrintIds, faces);
		defs = [];
		prints = [];
		faces = [];
		facePrintIds = [];
	}

	for await (const line of rl) {
		const card = parseLine(line);
		if (!card) continue;
		seen++;
		const rows = toCatalogRows(card);
		if (!rows) continue;
		kept++;
		defs.push(rows.definition);
		prints.push(rows.print);
		facePrintIds.push(rows.print.id);
		faces.push(...rows.faces);

		if (prints.length >= UPSERT_BATCH) await flushAll();
		if (seen % 50_000 === 0) console.log(`ℹ pass1: ${seen} lues, ${kept} gardées…`);
		if (limit > 0 && kept >= limit) break;
	}
	await flushAll();
	console.log(`✓ ${dryRun ? '[dry-run] ' : ''}pass1: ${kept}/${seen} cartes gardées`);
}

async function main() {
	const started = Date.now();
	await pass1();
	// pass2 added in the next task
	console.log(`✓ done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
	console.error('✖ seed-catalog failed:', err);
	process.exit(1);
});
