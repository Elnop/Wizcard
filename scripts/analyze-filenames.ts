/* eslint-disable sonarjs/slow-regex, sonarjs/cognitive-complexity */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

const DETECTORS: Record<string, RegExp> = {
	numeric_prefix: /^\d+\s*[-–—.]\s*/u,
	creator_suffix_dollar: /\$[^$()[\]]+$/u,
	freeform_bracket: /\[[^\]]*[\s,][^\]]*\]/u,
	non_numeric_brace: /\{[^}\d][^}]*\}/u,
	underscore: /_/u,
	art_number_parens: /\(\d\)/u,
	token: /\btoken\b/iu,
	slash_dfc: / \/\/ /u,
	no_extension: /^[^.]+$/u,
};

function classify(raw: string): string[] {
	return Object.entries(DETECTORS)
		.filter(([, re]) => re.test(raw))
		.map(([flag]) => flag);
}

async function main() {
	console.log('Loading raw_name from DB...\n');

	const PAGE_SIZE = 10_000;
	let offset = 0;
	const counts: Record<string, number> = {};
	const examples: Record<string, string[]> = {};
	let total = 0;
	let flagged = 0;

	while (true) {
		const { data, error } = await supabase
			.from('custom_cards')
			.select('raw_name')
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) throw error;
		if (!data || data.length === 0) break;

		for (const row of data as { raw_name: string }[]) {
			total++;
			const flags = classify(row.raw_name);
			if (flags.length > 0) {
				flagged++;
				for (const flag of flags) {
					counts[flag] = (counts[flag] ?? 0) + 1;
					if (!examples[flag]) examples[flag] = [];
					if (examples[flag].length < 8) examples[flag].push(row.raw_name);
				}
			}
		}

		offset += PAGE_SIZE;
		process.stdout.write(`\r  processed ${total.toLocaleString()}...`);
		if (data.length < PAGE_SIZE) break;
	}

	console.log(`\n\nTotal cards: ${total.toLocaleString()}`);
	console.log(
		`Flagged:     ${flagged.toLocaleString()} (${((flagged / total) * 100).toFixed(1)}%)\n`
	);

	const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

	for (const [flag, count] of sorted) {
		const pct = ((count / total) * 100).toFixed(2);
		console.log(`\n── ${flag} — ${count.toLocaleString()} (${pct}%)`);
		for (const ex of examples[flag]) {
			console.log(`   ${ex}`);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
