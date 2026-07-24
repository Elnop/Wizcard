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
import { fetchWithRetry } from '../lib/fetch-retry';
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
// Sanity floor for a complete all_cards stream (~535k lines as of 2026-07). Deliberately
// slack: the catalog only grows, and a real truncation loses far more than this margin.
const MIN_EXPECTED_LINES = 400_000;

// Prints whose Scryfall id changed this run (see deleteDriftedPrints), for the summary.
let driftedPrints = 0;

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
	const res = await fetchWithRetry(BULK_META_URL, {
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
	const res = await fetchWithRetry(url, { headers: { 'User-Agent': UA } });
	if (!res.ok || !res.body) {
		await res.body?.cancel();
		throw new Error(`bulk download failed: HTTP ${res.status}`);
	}
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
	// card_prints has TWO unique keys: the PK (id) and card_prints_set_number_lang_key
	// on (set, collector_number, lang). Scryfall occasionally reissues a print's id
	// while keeping the same set/number/lang — typically on spoiler-season sets whose
	// entries get rebuilt. Such a row is an INSERT under onConflict:'id', which then
	// trips the *other* unique index and fails the whole batch with "duplicate key
	// value violates unique constraint" (on data that holds no actual duplicates).
	// Drop the superseded row first so the new id takes over the triplet; its
	// card_print_faces go with it (on delete cascade) and are re-inserted below.
	await deleteDriftedPrints(rows);
	const { error } = await sb().from('card_prints').upsert(rows, { onConflict: 'id' });
	if (error) throw new Error(`card_prints upsert failed: ${error.message}`);
}

// Triplets per drift-lookup request. Each becomes one and(...) term in an or() filter,
// which PostgREST takes in the query string: 200 terms overflows kong's URL limit
// ("URI too long"), so keep chunks small. Also bounds the rows a request can return
// (at most CHUNK), staying well under PostgREST's 1000-row default cap.
const DRIFT_LOOKUP_CHUNK = 50;

/**
 * Deletes rows holding a batch triplet under a different id (see flushPrints).
 *
 * Matches the exact (set, collector_number, lang) triplets. Filtering by
 * .in('set', …).in('collector_number', …) instead would select the whole cross-product
 * of both lists — tens of thousands of unrelated rows for a 500-row batch — and
 * PostgREST silently truncates that at 1000, so the drifted row was invisible and the
 * upsert kept failing.
 */
async function deleteDriftedPrints(rows: CardPrintRow[]) {
	const byTriplet = new Map(rows.map((r) => [`${r.set}|${r.collector_number}|${r.lang}`, r.id]));
	const triplets = [...byTriplet.keys()];

	const stale: string[] = [];
	for (let i = 0; i < triplets.length; i += DRIFT_LOOKUP_CHUNK) {
		const chunk = triplets.slice(i, i + DRIFT_LOOKUP_CHUNK);
		// PostgREST or() terms are comma-separated; quote values so commas/parens in a
		// collector_number (e.g. "CHK-280", promo variants) can't break out of the filter.
		const filter = chunk
			.map((t) => {
				const [set, number, lang] = t.split('|');
				return `and(set.eq."${set}",collector_number.eq."${number}",lang.eq."${lang}")`;
			})
			.join(',');
		const { data, error } = await sb()
			.from('card_prints')
			.select('id, set, collector_number, lang')
			.or(filter);
		if (error) throw new Error(`card_prints drift lookup failed: ${error.message}`);
		for (const row of data ?? []) {
			const incomingId = byTriplet.get(`${row.set}|${row.collector_number}|${row.lang}`);
			if (incomingId && incomingId !== row.id) stale.push(row.id);
		}
	}
	if (stale.length === 0) return;

	for (let i = 0; i < stale.length; i += DELETE_CHUNK) {
		const chunk = stale.slice(i, i + DELETE_CHUNK);
		const { error } = await sb().from('card_prints').delete().in('id', chunk);
		if (error) throw new Error(`card_prints drift delete failed: ${error.message}`);
	}
	driftedPrints += stale.length;
	console.log(`ℹ ${stale.length} print(s) réémis par Scryfall — ancien id remplacé`);
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

async function pass1(): Promise<{ seen: number; kept: number }> {
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
	// A body can also end *cleanly* mid-file (connection closed without a TCP error),
	// which readline reports as a normal end-of-stream — pass 1 would then log a ✓ over
	// a truncated catalog and exit 0. Refuse to call that a success: the bulk holds
	// ~535k lines, so anything far short of that means we did not receive the file.
	if (limit === 0 && seen < MIN_EXPECTED_LINES) {
		throw new Error(
			`bulk stream ended early: ${seen} lignes lues (< ${MIN_EXPECTED_LINES} attendues) — ` +
				`téléchargement incomplet, la base n'est pas à jour`
		);
	}
	console.log(`✓ ${dryRun ? '[dry-run] ' : ''}pass1: ${kept}/${seen} cartes gardées`);
	return { seen, kept };
}

async function main() {
	const started = Date.now();
	const { seen, kept } = await pass1();
	await pass2();
	const secs = ((Date.now() - started) / 1000).toFixed(0);
	// Single-line summary for an unattended run: enough for cron mail / journald to say
	// what happened without digging through the progress lines.
	console.log(
		`✓ seed-catalog OK — ${kept}/${seen} cartes gardées, ${driftedPrints} print(s) réémis, ${secs}s`
	);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		// Exit 1 so cron/systemd sees the failure. Partial writes are safe to leave: every
		// write is an idempotent upsert, so the next run converges on the same state.
		console.error(`✖ seed-catalog failed: ${err instanceof Error ? err.message : err}`);
		if (err instanceof Error && err.stack) console.error(err.stack);
		process.exit(1);
	});
