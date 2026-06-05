import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { parseCardFilename } from '../src/lib/mpc/parse-filename';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

const PAGE_SIZE = 5_000;
const CONCURRENCY = 20;

async function main() {
	console.log('Re-parsing all raw_name values with updated parser...\n');

	let offset = 0;
	let total = 0;
	let updated = 0;
	let failed = 0;

	const limiter = pLimit(CONCURRENCY);

	while (true) {
		const { data, error } = await supabase
			.from('custom_cards')
			.select('id, raw_name')
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) throw error;
		if (!data || data.length === 0) break;

		const rows = data as { id: string; raw_name: string }[];

		await Promise.all(
			rows.map((row) =>
				limiter(async () => {
					const parsed = parseCardFilename(row.raw_name);
					const { error: updateErr } = await supabase
						.from('custom_cards')
						.update({
							name: parsed.cardName,
							set_code: parsed.setCode,
							collector_number: parsed.collectorNumber,
							variants: parsed.variants,
						})
						.eq('id', row.id);

					if (updateErr) {
						console.warn(`  ⚠ Failed to update ${row.id}: ${updateErr.message}`);
						failed++;
					} else {
						updated++;
					}
				})
			)
		);

		total += rows.length;
		process.stdout.write(
			`\r  processed ${total.toLocaleString()} (${updated.toLocaleString()} updated, ${failed} failed)...`
		);

		offset += PAGE_SIZE;
		if (rows.length < PAGE_SIZE) break;
	}

	console.log(`\n\n✅ Done. ${updated.toLocaleString()} cards updated, ${failed} failed.`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
