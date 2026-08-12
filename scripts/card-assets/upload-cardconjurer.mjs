// scripts/card-assets/upload-cardconjurer.mjs
//
// Téléverse les variantes WebP des cadres CardConjurer dans le bucket LOCAL
// `card-templates`, sous le préfixe `cc/<palier>/…`.
//
// Séparé de `upload-templates.ts` à dessein : celui-là charge `.env.seed` avec
// override et écrit donc en PRODUCTION (cf. docs/card-studio.md § Operational
// notes). Ce script-ci ne connaît que 127.0.0.1, sans configuration possible —
// on ne peut pas s'en servir pour toucher la prod par inadvertance.
//
// Le préfixe `cc/` isole ces assets de ceux de MSE (`card-assets/…`) : les deux
// jeux cohabitent pendant la migration, et revenir en arrière ne demande que de
// réécrire les chemins en base.
//
// Usage : SUPABASE_SERVICE_ROLE_KEY=... node scripts/card-assets/upload-cardconjurer.mjs <racine-out-webp>

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const URL_BASE = 'http://127.0.0.1:54321';
const BUCKET = 'card-templates';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY manquant. Récupère-le via `npx supabase status`.');
	process.exit(1);
}

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}

/**
 * Objets déjà en place, par clé -> taille.
 *
 * Sert à SAUTER ce qui est identique : le script est relancé plusieurs fois
 * pendant la migration, et re-pousser 3000 fichiers à chaque essai coûterait
 * plusieurs minutes pour rien. La taille suffit à décider — un WebP réencodé à
 * l'identique fait le même nombre d'octets.
 */
async function existingObjects(prefix) {
	const found = new Map();
	// L'API `list` ne descend pas dans les sous-dossiers : on l'appelle par
	// dossier, en file d'attente, plutôt que de supposer une arborescence plate.
	const queue = [prefix];
	while (queue.length > 0) {
		const current = queue.shift();
		const response = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ prefix: current, limit: 10000 }),
		});
		if (!response.ok) break;
		for (const entry of await response.json()) {
			const key = current ? `${current}/${entry.name}` : entry.name;
			// Un dossier se reconnaît à l'absence de métadonnées : l'API renvoie les
			// deux dans la même liste.
			if (entry.id === null || entry.metadata === null) queue.push(key);
			else found.set(key, entry.metadata?.size ?? -1);
		}
	}
	return found;
}

async function main() {
	const root = process.argv[2];
	if (!root) {
		console.error('usage: node upload-cardconjurer.mjs <racine-out-webp>');
		process.exit(1);
	}

	console.log('lecture des objets déjà présents…');
	const existing = await existingObjects('cc');
	console.log(`  ${existing.size} objets déjà dans le bucket`);

	let uploaded = 0;
	let skipped = 0;
	let failed = 0;

	for await (const file of walk(root)) {
		if (!file.endsWith('.webp')) continue;
		const key = `cc/${relative(root, file)}`;
		const size = (await stat(file)).size;
		if (existing.get(key) === size) {
			skipped += 1;
			continue;
		}

		const response = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${SERVICE_KEY}`,
				'Content-Type': 'image/webp',
				// Le bucket sert des assets immuables (le contenu d'une clé ne change
				// jamais), donc un cache long est sûr et évite de re-télécharger le
				// cadre à chaque changement de gabarit.
				'Cache-Control': 'public, max-age=31536000, immutable',
				'x-upsert': 'true',
			},
			body: await readFile(file),
		});
		if (!response.ok) {
			console.error(`  ÉCHEC ${key} — ${response.status} ${await response.text()}`);
			failed += 1;
			continue;
		}
		await response.body?.cancel();
		uploaded += 1;
		if (uploaded % 200 === 0) console.log(`  ${uploaded} fichiers téléversés…`);
	}

	console.log(`\n${uploaded} téléversés, ${skipped} déjà à jour, ${failed} en échec`);
	if (failed > 0) process.exit(1);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
