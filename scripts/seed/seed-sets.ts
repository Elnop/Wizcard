// Seed public.card_sets from Scryfall /sets (one small paged list, no bulk file).
//   npm run seed:sets
// Writes via the service-role key.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import type { ScryfallSet, ScryfallList } from '@/lib/scryfall/types/scryfall';

const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';

const { supabaseUrl: SUPABASE_URL, supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
	resolveSupabaseEnv();

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

async function main() {
	let url: string | null = 'https://api.scryfall.com/sets';
	const rows: CardSetRow[] = [];
	while (url) {
		const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
		const list = (await res.json()) as ScryfallList<ScryfallSet>;
		for (const s of list.data) rows.push(toRow(s));
		url = list.has_more && list.next_page ? list.next_page : null;
	}
	const { error } = await sb().from('card_sets').upsert(rows, { onConflict: 'code' });
	if (error) throw new Error(`card_sets upsert failed: ${error.message}`);
	console.log(`✓ seeded ${rows.length} sets`);
}

main().catch((err) => {
	console.error('✖ seed-sets failed:', err);
	process.exit(1);
});
