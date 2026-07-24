// Seed public.card_sets from Scryfall /sets (one small paged list, no bulk file).
//   npm run seed:sets
// Writes via the service-role key.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import { fetchWithRetry } from '../lib/fetch-retry';
import { createLogger } from '../lib/logger';
import type { ScryfallSet, ScryfallList } from '@/lib/scryfall/types/scryfall';

const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';
const log = createLogger('seed-sets');

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

interface CardSetRow {
	code: string;
	id: string | null;
	name: string;
	set_type: string | null;
	released_at: string | null;
	card_count: number | null;
	digital: boolean | null;
	icon_svg_uri: string | null;
	parent_set_code: string | null;
	block: string | null;
	block_code: string | null;
}

function toRow(s: ScryfallSet): CardSetRow {
	return {
		code: s.code,
		id: s.id ?? null,
		name: s.name,
		set_type: s.set_type ?? null,
		released_at: s.released_at ?? null,
		card_count: s.card_count ?? null,
		digital: s.digital ?? null,
		icon_svg_uri: s.icon_svg_uri ?? null,
		parent_set_code: s.parent_set_code ?? null,
		block: s.block ?? null,
		block_code: s.block_code ?? null,
	};
}

// Sanity floor for a complete /sets listing (~1050 as of 2026-07). Guards against
// upserting a truncated or empty page set over good data on a scheduled run.
const MIN_EXPECTED_SETS = 800;

async function main() {
	const started = Date.now();
	let url: string | null = 'https://api.scryfall.com/sets';
	const rows: CardSetRow[] = [];
	while (url) {
		const res = await fetchWithRetry(url, {
			init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
			logger: log,
		});
		if (!res.ok) {
			await res.body?.cancel();
			throw new Error(`GET ${url} failed: HTTP ${res.status}`);
		}
		const list = (await res.json()) as ScryfallList<ScryfallSet>;
		for (const s of list.data) rows.push(toRow(s));
		url = list.has_more && list.next_page ? list.next_page : null;
	}

	// Never let a short response shrink the table: the upsert would not delete rows, but
	// a near-empty result means the listing is unreliable and should not be trusted.
	if (rows.length < MIN_EXPECTED_SETS) {
		throw new Error(
			`only ${rows.length} sets reçus (< ${MIN_EXPECTED_SETS} attendus) — ` +
				`réponse Scryfall incomplète, upsert annulé`
		);
	}

	const { error } = await sb().from('card_sets').upsert(rows, { onConflict: 'code' });
	if (error) throw new Error(`card_sets upsert failed: ${error.message}`);
	log.info('run complete', {
		outcome: 'success',
		sets: rows.length,
		duration_ms: Date.now() - started,
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		// Exit 1 so cron/systemd sees the failure; the upsert is idempotent so the next
		// scheduled run converges on the same state.
		log.fatal('run complete', err, { outcome: 'failure' });
		process.exit(1);
	});
