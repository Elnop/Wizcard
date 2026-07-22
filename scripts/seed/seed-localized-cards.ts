// Seed manuel de public.localized_cards depuis le bulk file Scryfall `all_cards`.
//
//   npm run seed:localized-cards              — seed contre la DB pointée par l'env
//   npm run seed:localized-cards -- --dry-run — compter/normaliser sans écrire
//   npm run seed:localized-cards -- --limit=N — s'arrêter après N lignes upsertées
//
// Le bulk vit sur *.scryfall.io (AUCUN rate limit). Le SEUL appel à api.scryfall.com
// est le GET /bulk-data initial pour récupérer l'URL du fichier. On streame le
// .jsonl.gz ligne par ligne (jamais tout en mémoire — le fichier fait ~2.58 GB).
//
// Écrit via la service-role key (bypasse la RLS ; il n'existe aucune policy d'écriture).
// En prod : renseigner SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY de la prod avant de lancer.

import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { toLocalizedCardRow, type LocalizedCardRow } from './normalize-localized-card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BULK_META_URL = 'https://api.scryfall.com/bulk-data';
const UPSERT_BATCH = 500;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 0;

if (!SUPABASE_SERVICE_ROLE_KEY && !dryRun) {
	console.error('✖ Missing SUPABASE_SERVICE_ROLE_KEY (required unless --dry-run)');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

async function bulkUrl(): Promise<string> {
	const res = await fetch(BULK_META_URL, {
		headers: {
			'User-Agent': 'Wizcard/1.0 (https://github.com/devinedev/wizcard)',
			Accept: 'application/json',
		},
	});
	if (!res.ok) throw new Error(`GET /bulk-data failed: HTTP ${res.status}`);
	const json = (await res.json()) as {
		data: Array<{ type: string; download_uri: string; size: number }>;
	};
	const all = json.data.find((b) => b.type === 'all_cards');
	if (!all) throw new Error('all_cards entry not found in /bulk-data');
	console.log(`ℹ all_cards: ${(all.size / 1e6).toFixed(0)} MB — ${all.download_uri}`);
	return all.download_uri;
}

async function flush(rows: LocalizedCardRow[]): Promise<void> {
	if (rows.length === 0 || dryRun) return;
	const { error } = await supabase
		.from('localized_cards')
		.upsert(rows, { onConflict: 'set,collector_number,lang' });
	if (error) throw new Error(`upsert failed: ${error.message}`);
}

async function main(): Promise<void> {
	const started = Date.now();
	const url = await bulkUrl();

	const res = await fetch(url, {
		headers: { 'User-Agent': 'Wizcard/1.0 (https://github.com/devinedev/wizcard)' },
	});
	if (!res.ok || !res.body) throw new Error(`bulk download failed: HTTP ${res.status}`);

	// Node's fetch body is a web ReadableStream; bridge it to a Node stream and read
	// line-by-line. Scryfall serves `download_uri` as plain (uncompressed) pretty-printed
	// JSON — one card object per line, wrapped in a top-level `[` ... `]` array — despite
	// the `all_cards.jsonl.gz` naming convention suggested elsewhere; there is no
	// Content-Encoding: gzip on this response, so no gunzip stage belongs in this pipeline.
	// Never buffer the whole file in memory.
	const nodeStream = (await import('node:stream')).Readable.fromWeb(res.body as never);
	const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });

	let seen = 0;
	let kept = 0;
	let batch: LocalizedCardRow[] = [];

	for await (const line of rl) {
		const trimmed = line.trim().replace(/,$/, '');
		if (trimmed === '' || trimmed === '[' || trimmed === ']') continue;
		seen++;

		let card: ScryfallCard;
		try {
			card = JSON.parse(trimmed) as ScryfallCard;
		} catch {
			continue; // ligne non-JSON (bordure du tableau) — ignorer
		}

		const row = toLocalizedCardRow(card);
		if (!row) continue;
		batch.push(row);
		kept++;

		if (batch.length >= UPSERT_BATCH) {
			await flush(batch);
			batch = [];
		}
		if (seen % 50_000 === 0) console.log(`ℹ ${seen} lues, ${kept} gardées…`);
		if (limit > 0 && kept >= limit) break;
	}

	await flush(batch);
	const secs = ((Date.now() - started) / 1000).toFixed(0);
	console.log(
		`✓ ${dryRun ? '[dry-run] ' : ''}${kept} lignes localisées sur ${seen} cartes lues (${secs}s)`
	);
}

main().catch((err) => {
	console.error('✖ seed failed:', err);
	process.exit(1);
});
