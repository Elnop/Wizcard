// Two-pass streaming seed of the Scryfall card catalog from the all_cards bulk.
// all_cards (not default_cards) is the only bulk that contains non-English prints:
// default_cards is "English or the printed language if the card is only available in
// one language", so it holds ~no French prints of normal cards. We need EN + FR, so
// all_cards (~2.5 GB, every card in every language) is the source; toCatalogRows
// filters to lang in {en,fr} + paper.
// Pass 1 (this file): explode each kept card into card_definitions / card_prints /
// card_definition_faces / card_print_faces. Pass 2 (this file): re-streams the bulk
// and resolves all_parts (which cite the related PRINT id) into card_parts
// oracle->oracle edges, via a DB lookup against card_prints (never a whole-catalog
// in-memory map).
//
//   npm run seed:catalog                 -- seed against $SUPABASE_URL
//   npm run seed:catalog -- --dry-run    -- normalize/count without writing
//   npm run seed:catalog -- --limit=N    -- stop after N kept cards
//
// Streams the bulk (never buffers the whole file). Writes via the service-role key.

import { createInterface } from 'node:readline';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import {
	toCatalogRows,
	type CardDefinitionRow,
	type CardPrintRow,
	type CardDefinitionFaceRow,
	type CardPrintFaceRow,
} from './normalize-catalog-card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const BULK_META_URL = 'https://api.scryfall.com/bulk-data';
const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';
const UPSERT_BATCH = 500;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 0;

// The service-role key is only required when actually writing.
const { supabaseUrl: SUPABASE_URL, supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
	resolveSupabaseEnv(!dryRun);

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

async function flushDefinitionFaces(rows: CardDefinitionFaceRow[]) {
	if (rows.length === 0 || dryRun) return;
	// Multiple prints of the same oracle (e.g. en + fr, or reprints) emit identical
	// definition-face rows (gameplay is invariant per oracle) — dedupe per batch or
	// Postgres rejects the upsert with "ON CONFLICT DO UPDATE command cannot affect
	// row a second time" (same issue as flushDefs).
	const byKey = new Map(rows.map((r) => [`${r.oracle_id}|${r.face_index}`, r]));
	const { error } = await sb()
		.from('card_definition_faces')
		.upsert([...byKey.values()], { onConflict: 'oracle_id,face_index' });
	if (error) throw new Error(`card_definition_faces upsert failed: ${error.message}`);
}

async function flushPrintFaces(printIds: string[], rows: CardPrintFaceRow[]) {
	if (dryRun) return;
	// Replace print-faces for the prints in this batch: delete then insert (a print's
	// face set is small and fully known here). Chunk the delete: a full UPSERT_BATCH
	// (500) of UUIDs in one `.in()` overflows PostgREST/kong's URL length limit
	// ("URI too long").
	for (let i = 0; i < printIds.length; i += DELETE_CHUNK) {
		const chunk = printIds.slice(i, i + DELETE_CHUNK);
		if (chunk.length === 0) continue;
		const { error: delErr } = await sb().from('card_print_faces').delete().in('print_id', chunk);
		if (delErr) throw new Error(`card_print_faces delete failed: ${delErr.message}`);
	}
	if (rows.length > 0) {
		const { error } = await sb().from('card_print_faces').insert(rows);
		if (error) throw new Error(`card_print_faces insert failed: ${error.message}`);
	}
}

interface PartEdge {
	oracle_id: string;
	related_print_id: string;
	component: string;
	name: string | null;
	type_line: string | null;
}

interface CardPartRow {
	oracle_id: string;
	related_oracle_id: string;
	component: string;
	name: string | null;
	type_line: string | null;
}

// Resolve a batch of related print ids to their oracle ids via the DB (populated
// by pass 1). Returns a Map(print_id -> oracle_id) for the ids that exist.
async function resolveOracleIds(printIds: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (dryRun || printIds.length === 0) return out;
	const unique = [...new Set(printIds)];
	// Chunked like flushPrintFaces' delete: a full UPSERT_BATCH (500) of UUIDs in one
	// `.in()` overflows PostgREST/kong's URL length limit ("URI too long").
	for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
		const chunk = unique.slice(i, i + DELETE_CHUNK);
		const { data, error } = await sb().from('card_prints').select('id, oracle_id').in('id', chunk);
		if (error) throw new Error(`card_prints resolve failed: ${error.message}`);
		for (const r of data as Array<{ id: string; oracle_id: string }>) out.set(r.id, r.oracle_id);
	}
	return out;
}

async function flushParts(rows: CardPartRow[]) {
	if (rows.length === 0 || dryRun) return;
	// Multiple prints of the same oracle card (e.g. en + fr) each carry their own
	// all_parts pointing at the same related part, so the same (oracle_id,
	// related_oracle_id, component) edge can appear more than once in a batch —
	// dedupe per batch or Postgres rejects the upsert with "ON CONFLICT DO UPDATE
	// command cannot affect row a second time" (same issue as flushDefs).
	const byKey = new Map(
		rows.map((r) => [`${r.oracle_id}|${r.related_oracle_id}|${r.component}`, r])
	);
	const { error } = await sb()
		.from('card_parts')
		.upsert([...byKey.values()], { onConflict: 'oracle_id,related_oracle_id,component' });
	if (error) throw new Error(`card_parts upsert failed: ${error.message}`);
}

async function pass2(): Promise<void> {
	const url = await bulkUrl('all_cards');
	const rl = await openBulkLines(url);

	let seen = 0;
	let edges: PartEdge[] = [];

	async function flushEdgeBatch() {
		if (edges.length === 0) return;
		const map = await resolveOracleIds(edges.map((e) => e.related_print_id));
		const rows: CardPartRow[] = [];
		for (const e of edges) {
			const related = map.get(e.related_print_id);
			if (!related) continue; // cited print not in catalog — skip
			rows.push({
				oracle_id: e.oracle_id,
				related_oracle_id: related,
				component: e.component,
				name: e.name,
				type_line: e.type_line,
			});
		}
		await flushParts(rows);
		edges = [];
	}

	for await (const line of rl) {
		const card = parseLine(line);
		if (!card) continue;
		seen++;
		// Only cards we kept in pass 1 contribute edges (same filter).
		const rowsFromCard = toCatalogRows(card);
		if (!rowsFromCard || !card.all_parts?.length) continue;
		for (const p of card.all_parts) {
			edges.push({
				oracle_id: card.oracle_id,
				related_print_id: p.id,
				component: p.component,
				name: p.name ?? null,
				type_line: p.type_line ?? null,
			});
		}
		if (edges.length >= UPSERT_BATCH) await flushEdgeBatch();
		if (seen % 50_000 === 0) console.log(`ℹ pass2: ${seen} lues…`);
		if (limit > 0 && seen >= limit * 5) break; // parts are sparse; scan a bit wider under --limit
	}
	await flushEdgeBatch();
	console.log(`✓ ${dryRun ? '[dry-run] ' : ''}pass2: edges resolved`);
}

async function pass1(): Promise<void> {
	const url = await bulkUrl('all_cards');
	const rl = await openBulkLines(url);

	let seen = 0;
	let kept = 0;
	let defs: CardDefinitionRow[] = [];
	let prints: CardPrintRow[] = [];
	let defFaces: CardDefinitionFaceRow[] = [];
	let printFaces: CardPrintFaceRow[] = [];
	let facePrintIds: string[] = [];

	async function flushAll() {
		// FK order: card_definitions -> card_definition_faces -> card_prints -> card_print_faces.
		await flushDefs(defs);
		await flushDefinitionFaces(defFaces);
		await flushPrints(prints);
		await flushPrintFaces(facePrintIds, printFaces);
		defs = [];
		prints = [];
		defFaces = [];
		printFaces = [];
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
		defFaces.push(...rows.definitionFaces);
		printFaces.push(...rows.printFaces);
		facePrintIds.push(rows.print.id);

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
	await pass2();
	console.log(`✓ done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
	console.error('✖ seed-catalog failed:', err);
	process.exit(1);
});
