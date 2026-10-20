// Pure helpers for seed-migrations.ts: validate and map Scryfall /migrations objects
// into public.scryfall_migrations rows. No side effects, so node:test covers them.

/** One row of public.scryfall_migrations. `recorded_at` is never sent (DB default). */
export interface ScryfallMigrationRow {
	id: string;
	strategy: 'merge' | 'delete';
	old_scryfall_id: string;
	new_scryfall_id: string | null;
	note: string | null;
	performed_at: string;
	metadata: Record<string, unknown> | null;
}

/** The paging fields of a Scryfall list object. */
export interface ScryfallListPage {
	has_more?: unknown;
	next_page?: unknown;
	data?: unknown;
}

// Sanity floor for a complete /migrations listing (2,806 as of 2026-10-20). Guards
// against upserting a truncated listing; never compared to the stored count, since a
// migration removed by Scryfall would then block the job forever.
export const MIN_EXPECTED_MIGRATIONS = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCRYFALL_API = 'https://api.scryfall.com/';

/** A real calendar date in YYYY-MM-DD form (2026-02-30 is rejected, as Postgres would). */
function isCalendarDate(v: unknown): v is string {
	if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
	const d = new Date(v + 'T00:00:00Z');
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isUuid(v: unknown): v is string {
	return typeof v === 'string' && UUID_RE.test(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates one Scryfall migration object and maps it to a row; throws citing the id. */
export function toMigrationRow(obj: unknown): ScryfallMigrationRow {
	if (!isPlainObject(obj)) throw new Error('migration invalide : pas un objet');
	const ref = typeof obj.id === 'string' ? obj.id : JSON.stringify(obj.id);
	const fail = (why: string): never => {
		throw new Error(`migration ${ref} invalide : ${why}`);
	};

	if (obj.object !== 'migration') fail(`object = ${JSON.stringify(obj.object)}`);
	if (!isUuid(obj.id)) fail('id non-UUID');
	const strategy = obj.migration_strategy;
	if (strategy !== 'merge' && strategy !== 'delete')
		fail(`migration_strategy inconnue ${JSON.stringify(strategy)}`);
	if (!isUuid(obj.old_scryfall_id)) fail('old_scryfall_id non-UUID');
	const newId = obj.new_scryfall_id ?? null;
	if (newId !== null && !isUuid(newId)) fail('new_scryfall_id non-UUID');
	if (strategy === 'merge' && newId === null) fail('merge sans new_scryfall_id');
	const note = obj.note ?? null;
	if (note !== null && typeof note !== 'string') fail('note non textuelle');
	const performedAt = obj.performed_at;
	if (!isCalendarDate(performedAt)) fail(`performed_at invalide ${JSON.stringify(performedAt)}`);
	const metadata = obj.metadata ?? null;
	if (metadata !== null && !isPlainObject(metadata)) fail('metadata non objet');

	return {
		id: (obj.id as string).toLowerCase(),
		strategy: strategy as 'merge' | 'delete',
		old_scryfall_id: (obj.old_scryfall_id as string).toLowerCase(),
		new_scryfall_id: newId === null ? null : (newId as string).toLowerCase(),
		note: note as string | null,
		performed_at: performedAt as string,
		metadata: metadata as Record<string, unknown> | null,
	};
}

/** URL of the next page, or null on the last one; throws on inconsistent paging. */
export function nextPageUrl(list: ScryfallListPage): string | null {
	if (list.has_more === true) {
		if (typeof list.next_page !== 'string' || list.next_page === '')
			throw new Error('pagination incohérente : has_more sans next_page');
		if (!list.next_page.startsWith(SCRYFALL_API))
			throw new Error(`pagination incohérente : next_page hors Scryfall ${list.next_page}`);
		return list.next_page;
	}
	if (list.has_more === false) return null;
	throw new Error(`pagination incohérente : has_more = ${JSON.stringify(list.has_more)}`);
}

/**
 * Drops repeated ids (first occurrence wins). A migration added while paging shifts
 * the list, so the same object can show up on two consecutive pages; a single upsert
 * batch cannot touch the same row twice.
 */
export function dedupeById(rows: ScryfallMigrationRow[]): ScryfallMigrationRow[] {
	const seen = new Set<string>();
	return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** Throws when the listing is below the sanity floor (truncated Scryfall response). */
export function assertComplete(rows: readonly ScryfallMigrationRow[]): void {
	if (rows.length < MIN_EXPECTED_MIGRATIONS) {
		throw new Error(
			`only ${rows.length} migrations reçues (< ${MIN_EXPECTED_MIGRATIONS} attendues) — ` +
				`réponse Scryfall incomplète, upsert annulé`
		);
	}
}

/** Fetches one page of a Scryfall list; throws on HTTP failure. */
export type FetchMigrationsPage = (url: string) => Promise<ScryfallListPage>;

export const MIGRATIONS_URL = 'https://api.scryfall.com/migrations';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetches EVERY page, validates every object, dedupes and checks the floor — all
 * before the caller writes anything. Any failure throws and stops paging.
 * `delayMs` spaces page requests (Scryfall asks for 50–100 ms between calls).
 */
export async function collectMigrations(
	fetchPage: FetchMigrationsPage,
	firstUrl: string = MIGRATIONS_URL,
	delayMs = 100
): Promise<{ rows: ScryfallMigrationRow[]; pages: number; duplicates: number }> {
	const visited = new Set<string>();
	const all: ScryfallMigrationRow[] = [];
	let url: string | null = firstUrl;
	while (url) {
		if (visited.has(url)) throw new Error(`pagination incohérente : page déjà lue ${url}`);
		if (visited.size > 0 && delayMs > 0) await sleep(delayMs);
		visited.add(url);
		const list = await fetchPage(url);
		if (!Array.isArray(list.data)) throw new Error(`GET ${url} : data absent ou non tableau`);
		for (const obj of list.data) all.push(toMigrationRow(obj));
		url = nextPageUrl(list);
	}
	const rows = dedupeById(all);
	assertComplete(rows);
	return { rows, pages: visited.size, duplicates: all.length - rows.length };
}
