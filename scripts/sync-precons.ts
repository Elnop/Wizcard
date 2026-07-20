// Sync MTGJSON preconstructed decks into public.decks / public.cards.
//
//   npm run precons:sync                  — sync everything that changed
//   npm run precons:sync -- --force       — re-import all, ignoring versions
//   npm run precons:sync -- --deck=NAME   — one deck by MTGJSON fileName
//   npm run precons:sync -- --dry-run     — log planned writes, touch nothing
//   npm run precons:sync -- --limit=10    — stop after N decks
//
// Card enrichment is NOT done here: rows land with enriched_at NULL and the
// existing Scryfall enrich worker fills them in, the same as MPC ingest.

import { flags, log } from './precons/config';
import { fetchMeta, fetchDeckList, fetchDeck } from './precons/mtgjson-client';
import { fetchSyncedVersions, upsertPrecon } from './precons/db-writer';
import { isImportableDeck } from './precons/deck-filter';

async function main(): Promise<void> {
	const started = Date.now();

	const meta = await fetchMeta();
	log(`ℹ MTGJSON version ${meta.version} (${meta.date})`);

	const all = await fetchDeckList();

	// MTGJSON lists PRODUCTS, not decks: Secret Lair drops, set redemptions,
	// land packs and booster contents are card bundles with no decklist meaning.
	// Filter before anything else so they are never fetched or written.
	const decksOnly = all.filter((d) => isImportableDeck(d.type, d.name));
	log(
		`ℹ ${all.length} MTGJSON entries, ${decksOnly.length} are decks (${all.length - decksOnly.length} product SKUs skipped)`
	);

	const list = flags.deckFile ? decksOnly.filter((d) => d.fileName === flags.deckFile) : decksOnly;
	if (flags.deckFile && list.length === 0) {
		log(`✖ no importable deck with fileName "${flags.deckFile}"`);
		process.exit(1);
	}
	const targets = flags.limit > 0 ? list.slice(0, flags.limit) : list;
	log(`ℹ ${targets.length} deck(s) to consider`);

	const synced = await fetchSyncedVersions();

	let imported = 0;
	let skipped = 0;
	let failed = 0;
	let cardRows = 0;
	let lastProgressLog = Date.now();

	for (const [i, entry] of targets.entries()) {
		const position = `[${i + 1}/${targets.length}]`;
		const current = synced.get(entry.fileName);

		if (!flags.force && current === meta.version) {
			skipped++;
			// Log progress every 30s on skip path to indicate the script is still running
			if (Date.now() - lastProgressLog > 30000) {
				log(`ℹ checked ${i + 1}/${targets.length} decks`);
				lastProgressLog = Date.now();
			}
			continue;
		}

		try {
			log(`${position} ${entry.name} (${entry.type})`);
			const deck = await fetchDeck(entry.fileName);
			const { cardCount } = await upsertPrecon(entry.fileName, deck, meta.version);
			cardRows += cardCount;
			imported++;
			log(`  ✓ ${cardCount} card rows`);
			lastProgressLog = Date.now();
		} catch (err) {
			failed++;
			log(`  ✖ ${entry.fileName}: ${err instanceof Error ? err.message : String(err)}`);
			lastProgressLog = Date.now();
		}
	}

	const secs = Math.round((Date.now() - started) / 1000);
	log(
		`\n${flags.dryRun ? '[dry-run] ' : ''}done in ${secs}s — ` +
			`${imported} imported, ${skipped} up-to-date, ${failed} failed, ${cardRows} card rows`
	);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
