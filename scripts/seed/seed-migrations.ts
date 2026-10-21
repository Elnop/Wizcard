// Seed public.scryfall_migrations from Scryfall /migrations (a small paged list).
//   npm run seed:migrations
// Writes via the service-role key. Every page is fetched and every object validated
// BEFORE any write: a failed page, inconsistent paging, an invalid object or a
// truncated listing aborts the run (exit 1) with nothing written.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import { fetchWithRetry } from '../lib/fetch-retry';
import { createLogger } from '../lib/logger';
import { collectMigrations, type ScryfallListPage } from './scryfall-migrations';

const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';
const log = createLogger('seed-migrations');

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

const BATCH_SIZE = 500;

async function fetchPage(url: string): Promise<ScryfallListPage> {
	const res = await fetchWithRetry(url, {
		init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
		logger: log,
	});
	if (!res.ok) {
		await res.body?.cancel();
		throw new Error(`GET ${url} failed: HTTP ${res.status}`);
	}
	return (await res.json()) as ScryfallListPage;
}

async function main() {
	const started = Date.now();
	// Every page fetched and validated, deduped and floor-checked before any write.
	const { rows, pages, duplicates } = await collectMigrations(fetchPage);

	// recorded_at is never sent: set by its default on first insert, never rewritten.
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const { error } = await sb()
			.from('scryfall_migrations')
			.upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'id' });
		if (error) throw new Error(`scryfall_migrations upsert failed: ${error.message}`);
	}
	log.info('run complete', {
		outcome: 'success',
		migrations: rows.length,
		pages,
		duplicates,
		duration_ms: Date.now() - started,
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		// Exit 1 so the workflow's alert job opens an issue; the upsert is idempotent so
		// the next run converges on the same state.
		log.fatal('run complete', err, { outcome: 'failure' });
		process.exit(1);
	});
