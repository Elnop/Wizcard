// Publish the weekly "Catalogue" digest (story 3.3, issue #62).
//   npm run digest:catalog
//   npm run digest:catalog -- --baseline   (set the marker to the current max, publish
//                                           nothing; never required: see below)
// Runs after the catalog seed (workflow step `Digest`, after `Seed migrations`).
//
// 1. Reads the marker (max last_change_id / last_migration_recorded_at of
//    catalog_digests) and the window above it: catalog_changes.id > marker and
//    scryfall_migrations.recorded_at > marker, both capped at their current max.
//    With NO marker yet (first run ever, in prod or on a fresh local DB), it only
//    sets the initial marker, like --baseline: the first seed never publishes, so the
//    whole history (initial catalog load, 2,800 historical migrations) is never
//    announced.
// 2. Reads the reference data the window cites (prints, names, sets), by pages.
// 3. Builds the fr/en article with the pure catalog-digest-build.ts (no LLM).
// 4. publish_catalog_digest() inserts the article and advances the marker in ONE
//    transaction. A window with nothing announceable (only `oldschool` legalities,
//    drift…) advances the marker without an article; an empty window does nothing.
// Reads and writes with the service-role key. Any failure exits 1 (alert issue) with
// neither article nor marker written.

import { appendFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import { createLogger } from '../lib/logger';
import {
	buildCatalogDigest,
	oraclesToLink,
	referencedIds,
	type ChangeRow,
	type DigestArticle,
	type MigrationRow,
	type PrintRef,
	type SetRef,
} from './catalog-digest-build';

const log = createLogger('catalog-digest');

const { supabaseUrl: SUPABASE_URL, supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
	resolveSupabaseEnv(log);

let _sb: SupabaseClient | null = null;
function sb() {
	if (!_sb)
		_sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false },
		});
	return _sb;
}

const CARD_PRINTS_READ = 'card_prints read';
const RUN_COMPLETE = 'run complete';
const CHANGES_READ = 'catalog_changes read';
const MIGRATIONS_READ = 'scryfall_migrations read';

/** PostgREST max_rows (supabase/config.toml): never ask for more per request. */
const PAGE = 1000;
/** ids per `in.(…)` filter: 300 uuids already hit HTTP 414. */
const IN_CHUNK = 150;
/** Parallel requests for the reference reads. */
const CONCURRENCY = 8;

function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

async function mapLimit<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
	return out;
}

function fail(what: string, error: { message: string }): never {
	throw new Error(`${what} failed: ${error.message}`);
}

// --- Marker and window -----------------------------------------------------------------

interface Marker {
	/** False until the first digest (or baseline) has written a marker row. */
	exists: boolean;
	lastChangeId: number;
	lastMigrationRecordedAt: string | null;
}

async function readMarker(): Promise<Marker> {
	const byChange = await sb()
		.from('catalog_digests')
		.select('last_change_id')
		.order('last_change_id', { ascending: false })
		.limit(1);
	if (byChange.error) fail('catalog_digests read', byChange.error);
	const byMigration = await sb()
		.from('catalog_digests')
		.select('last_migration_recorded_at')
		.not('last_migration_recorded_at', 'is', null)
		.order('last_migration_recorded_at', { ascending: false })
		.limit(1);
	if (byMigration.error) fail('catalog_digests read', byMigration.error);
	return {
		exists: byChange.data.length > 0,
		lastChangeId: Number(byChange.data[0]?.last_change_id ?? 0),
		lastMigrationRecordedAt:
			(byMigration.data[0]?.last_migration_recorded_at as string | undefined) ?? null,
	};
}

/** Journal rows above the marker, up to the max id seen when the read starts. */
async function readChanges(from: number): Promise<{ rows: ChangeRow[]; upTo: number }> {
	const top = await sb()
		.from('catalog_changes')
		.select('id')
		.order('id', { ascending: false })
		.limit(1);
	if (top.error) fail(CHANGES_READ, top.error);
	const upTo = Math.max(from, Number(top.data[0]?.id ?? 0));
	const rows: ChangeRow[] = [];
	let after = from;
	while (after < upTo) {
		const { data, error } = await sb()
			.from('catalog_changes')
			.select('id, entity, change, print_id, oracle_id, face_index, field, old_value, new_value')
			.gt('id', after)
			.lte('id', upTo)
			.order('id', { ascending: true })
			.limit(PAGE);
		if (error) fail(CHANGES_READ, error);
		if (data.length === 0) break;
		for (const r of data) rows.push({ ...(r as ChangeRow), id: Number(r.id) });
		after = rows[rows.length - 1].id;
	}
	return { rows, upTo };
}

/** Migrations recorded after the marker, up to the latest recorded_at at read start. */
async function readMigrations(
	from: string | null
): Promise<{ rows: MigrationRow[]; upTo: string | null }> {
	let topQ = sb()
		.from('scryfall_migrations')
		.select('recorded_at')
		.order('recorded_at', { ascending: false })
		.limit(1);
	if (from !== null) topQ = topQ.gt('recorded_at', from);
	const top = await topQ;
	if (top.error) fail(MIGRATIONS_READ, top.error);
	const upTo = (top.data[0]?.recorded_at as string | undefined) ?? null;
	if (upTo === null) return { rows: [], upTo: from };

	const rows: MigrationRow[] = [];
	for (let offset = 0; ; offset += PAGE) {
		let q = sb()
			.from('scryfall_migrations')
			.select(
				'id, strategy, old_scryfall_id, new_scryfall_id, note, performed_at, metadata, recorded_at'
			)
			.lte('recorded_at', upTo);
		if (from !== null) q = q.gt('recorded_at', from);
		const { data, error } = await q
			.order('recorded_at', { ascending: true })
			.order('id', { ascending: true })
			.range(offset, offset + PAGE - 1);
		if (error) fail(MIGRATIONS_READ, error);
		rows.push(...(data as MigrationRow[]));
		if (data.length < PAGE) break;
	}
	return { rows, upTo };
}

// --- Reference data ----------------------------------------------------------------------

interface PrintRow {
	id: string;
	oracle_id: string;
	set: string;
	collector_number: string;
	lang: string;
	card_definitions: { name: string } | { name: string }[] | null;
}

function defName(row: PrintRow): string | null {
	const d = row.card_definitions;
	if (Array.isArray(d)) return d[0]?.name ?? null;
	return d?.name ?? null;
}

async function readPrints(ids: string[]): Promise<Map<string, PrintRef>> {
	const out = new Map<string, PrintRef>();
	await mapLimit(chunk(ids, IN_CHUNK), async (part) => {
		const { data, error } = await sb()
			.from('card_prints')
			.select('id, oracle_id, set, collector_number, lang, card_definitions(name)')
			.in('id', part);
		if (error) fail(CARD_PRINTS_READ, error);
		for (const r of data as unknown as PrintRow[]) {
			out.set(r.id, {
				id: r.id,
				oracle_id: r.oracle_id,
				set: r.set,
				collector_number: r.collector_number,
				lang: r.lang,
				name: defName(r),
			});
		}
	});
	return out;
}

async function readOracleNames(ids: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	await mapLimit(chunk(ids, IN_CHUNK), async (part) => {
		const { data, error } = await sb()
			.from('card_definitions')
			.select('oracle_id, name')
			.in('oracle_id', part);
		if (error) fail('card_definitions read', error);
		for (const r of data) out.set(r.oracle_id as string, r.name as string);
	});
	return out;
}

/**
 * One current print per oracle, to link oracle-level lines (errata, legalities):
 * English first, then the most recent release, then the smallest id.
 */
async function readOraclePrints(ids: string[]): Promise<Map<string, string>> {
	type Row = { id: string; oracle_id: string; lang: string; released_at: string | null };
	const best = new Map<string, Row>();
	const better = (a: Row, b: Row) => {
		if (a.lang !== b.lang) return a.lang === 'en';
		const ra = a.released_at ?? '';
		const rb = b.released_at ?? '';
		if (ra !== rb) return ra > rb;
		return a.id < b.id;
	};
	await mapLimit(chunk(ids, IN_CHUNK), async (part) => {
		for (let offset = 0; ; offset += PAGE) {
			const { data, error } = await sb()
				.from('card_prints')
				.select('id, oracle_id, lang, released_at')
				.in('oracle_id', part)
				.order('id', { ascending: true })
				.range(offset, offset + PAGE - 1);
			if (error) fail(CARD_PRINTS_READ, error);
			for (const r of data as Row[]) {
				const cur = best.get(r.oracle_id);
				if (!cur || better(r, cur)) best.set(r.oracle_id, r);
			}
			if (data.length < PAGE) break;
		}
	});
	return new Map([...best].map(([oracle, r]) => [oracle, r.id]));
}

async function readSets(codes: string[]): Promise<Map<string, SetRef>> {
	const out = new Map<string, SetRef>();
	await mapLimit(chunk(codes, IN_CHUNK), async (part) => {
		const { data, error } = await sb()
			.from('card_sets')
			.select('code, name, released_at')
			.in('code', part);
		if (error) fail('card_sets read', error);
		for (const r of data as SetRef[]) out.set(r.code, r);
	});
	return out;
}

async function readSetPrintCounts(codes: string[]): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	await mapLimit(codes, async (code) => {
		const { count, error } = await sb()
			.from('card_prints')
			.select('id', { count: 'exact', head: true })
			.eq('set', code);
		if (error) fail('card_prints count', error);
		out.set(code, count ?? 0);
	});
	return out;
}

// --- Main --------------------------------------------------------------------------------

function summary(line: string): void {
	const file = process.env.GITHUB_STEP_SUMMARY;
	if (file) appendFileSync(file, `- **catalog-digest** : ${line}\n`);
}

/** Inserts the article (when given) and the new marker in one transaction. */
async function publish(
	marker: Marker,
	article: DigestArticle | null,
	lastChangeId: number,
	lastMigrationRecordedAt: string | null
): Promise<string | null> {
	const { data: slug, error } = await sb().rpc('publish_catalog_digest', {
		p_slug: article?.slug ?? null,
		p_title_fr: article?.title_fr ?? null,
		p_title_en: article?.title_en ?? null,
		p_body_fr: article?.body_fr ?? null,
		p_body_en: article?.body_en ?? null,
		p_from_change_id: marker.lastChangeId,
		p_from_migration_recorded_at: marker.lastMigrationRecordedAt,
		p_last_change_id: lastChangeId,
		p_last_migration_recorded_at: lastMigrationRecordedAt,
	});
	if (error) fail('publish_catalog_digest', error);
	return typeof slug === 'string' ? slug : null;
}

/** Current max of the journal id and of the migrations' recorded_at (whole tables). */
async function readMaxima(): Promise<{ changeId: number; migrationRecordedAt: string | null }> {
	const top = await sb()
		.from('catalog_changes')
		.select('id')
		.order('id', { ascending: false })
		.limit(1);
	if (top.error) fail(CHANGES_READ, top.error);
	const mig = await sb()
		.from('scryfall_migrations')
		.select('recorded_at')
		.order('recorded_at', { ascending: false })
		.limit(1);
	if (mig.error) fail(MIGRATIONS_READ, mig.error);
	return {
		changeId: Number(top.data[0]?.id ?? 0),
		migrationRecordedAt: (mig.data[0]?.recorded_at as string | undefined) ?? null,
	};
}

/**
 * --baseline, and the first run ever (no marker yet): the marker jumps to the current
 * max; nothing is published.
 */
async function baseline(started: number, marker?: Marker): Promise<void> {
	marker ??= await readMarker();
	const max = await readMaxima();
	const lastChangeId = Math.max(marker.lastChangeId, max.changeId);
	const lastMigration = max.migrationRecordedAt ?? marker.lastMigrationRecordedAt;
	await publish(marker, null, lastChangeId, lastMigration);
	summary("repère initial posé, pas d'article");
	log.info(RUN_COMPLETE, {
		outcome: 'success',
		baseline: true,
		published: false,
		last_change_id: lastChangeId,
		last_migration_recorded_at: lastMigration,
		duration_ms: Date.now() - started,
	});
}

async function main() {
	const started = Date.now();
	if (process.argv.includes('--baseline')) return baseline(started);
	const marker = await readMarker();
	if (!marker.exists) return baseline(started, marker);
	const changes = await readChanges(marker.lastChangeId);
	const migrations = await readMigrations(marker.lastMigrationRecordedAt);
	log.info('window read', {
		from_change_id: marker.lastChangeId,
		to_change_id: changes.upTo,
		changes: changes.rows.length,
		from_migration: marker.lastMigrationRecordedAt,
		to_migration: migrations.upTo,
		migrations: migrations.rows.length,
	});

	if (changes.rows.length === 0 && migrations.rows.length === 0) {
		summary("aucun changement, pas d'article");
		log.info(RUN_COMPLETE, {
			outcome: 'success',
			published: false,
			duration_ms: Date.now() - started,
		});
		return;
	}

	const { printIds, oracleIds } = referencedIds(changes.rows, migrations.rows);
	const prints = await readPrints(printIds);
	const removedSets = changes.rows
		.filter((c) => c.entity === 'print' && c.change === 'removed')
		.map((c) => (c.old_value as { set?: unknown } | null)?.set)
		.filter((s): s is string => typeof s === 'string');
	const setCodes = [...new Set([...[...prints.values()].map((p) => p.set), ...removedSets])];
	const addedPrintIds = new Set(
		changes.rows
			.filter((c) => c.entity === 'print' && c.change === 'added' && c.print_id)
			.map((c) => c.print_id as string)
	);
	const addedSetCodes = [
		...new Set([...prints.values()].filter((p) => addedPrintIds.has(p.id)).map((p) => p.set)),
	];
	const [oracleNames, sets, setPrintCounts] = await Promise.all([
		readOracleNames(oracleIds),
		readSets(setCodes),
		readSetPrintCounts(addedSetCodes),
	]);
	const input = {
		changes: changes.rows,
		migrations: migrations.rows,
		prints,
		oracleNames,
		oraclePrints: new Map<string, string>(),
		sets,
		setPrintCounts,
		date: new Date(),
	};
	// Only the oracles of the lines actually shown with a link (names are needed first
	// to know which lines make the LINE_LIMIT cut).
	const oraclePrints = await readOraclePrints(oraclesToLink(input));
	log.info('references read', {
		prints: prints.size,
		oracles: oracleNames.size,
		linked_oracles: oraclePrints.size,
		sets: sets.size,
	});

	const article = buildCatalogDigest({ ...input, oraclePrints });
	const slug = await publish(marker, article, changes.upTo, migrations.upTo);

	if (slug !== null) summary(`article publié : ${slug}`);
	else summary("aucun changement, pas d'article (repère avancé)");
	log.info(RUN_COMPLETE, {
		outcome: 'success',
		published: slug !== null,
		slug,
		last_change_id: changes.upTo,
		last_migration_recorded_at: migrations.upTo,
		duration_ms: Date.now() - started,
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		// Exit 1 so the workflow's alert job opens an issue. Nothing was written: the
		// article and the marker go in one transaction, so the next run retries the
		// same window.
		log.fatal(RUN_COMPLETE, err, { outcome: 'failure' });
		process.exit(1);
	});
