/**
 * Téléverse dans le Storage LOCAL les assets de gabarits référencés par la DB
 * mais absents du bucket.
 *
 * Pourquoi ce script existe. `npm run card-assets` fait ce travail, mais il
 * charge `.env.seed` avec `override: true` et vise donc la PRODUCTION : on ne
 * peut pas s'en servir pour réparer une base locale. Le bucket local, lui,
 * date d'avant l'ajout des clés `land-colorless` / `colorless` et des
 * `blend_masks` : les cadres de couleur y sont tous, les plaques grises et les
 * masques de fondu presque jamais. Résultat, un coût hybride affiche une carte
 * VIDE sur la plupart des gabarits — le masque ne se charge pas, donc il
 * masque tout.
 *
 * Ce script ne lit QUE `.env.local`, refuse toute URL non locale, et ne
 * téléverse que ce qui manque. Il ne touche jamais à la DB.
 *
 * Usage :
 *   node scripts/card-assets/seed-local-missing-assets.mjs --dry-run
 *   node scripts/card-assets/seed-local-missing-assets.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BUCKET = 'card-templates';
const ASSETS_ROOT = path.resolve('assets/card-templates');
const DRY_RUN = process.argv.includes('--dry-run');

/** Types MIME par extension. Storage sert le fichier tel quel : un mauvais
 * Content-Type et le navigateur refuse de décoder l'image. */
const MIME = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
};

/** Lit .env.local sans dépendance : on veut être certain de ne charger NI
 * .env.seed NI .env.supabase.prod, qui pointent tous deux sur la production. */
function readLocalEnv() {
	const raw = fs.readFileSync(path.resolve('.env.local'), 'utf8');
	const env = {};
	for (const line of raw.split('\n')) {
		const separator = line.indexOf('=');
		if (separator === -1) continue;
		const name = line.slice(0, separator).trim();
		if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) continue;
		env[name] = line
			.slice(separator + 1)
			.trim()
			.replace(/^["']|["']$/g, '');
	}
	return env;
}

function assertLocal(url) {
	let host;
	try {
		host = new URL(url).hostname;
	} catch {
		throw new Error(`URL Supabase illisible : ${url}`);
	}
	if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
		throw new Error(
			`REFUS : ${url} n'est pas une instance locale. Ce script ne téléverse ` +
				`qu'en local — pour la production, passer par npm run card-assets en connaissance de cause.`
		);
	}
}

/** Tous les chemins d'assets référencés par la DB : cadres, masques, couronnes. */
async function collectReferencedPaths(client) {
	const { data, error } = await client
		.from('card_templates')
		.select('frame_paths, blend_masks, crown_paths');
	if (error) throw new Error(`Lecture de card_templates : ${error.message}`);

	const referenced = new Set();
	for (const row of data) {
		for (const column of [row.frame_paths, row.blend_masks, row.crown_paths]) {
			for (const value of Object.values(column ?? {})) referenced.add(value);
		}
	}
	return referenced;
}

/**
 * Inventaire du bucket. On pagine : `list` plafonne à 100 entrées par appel et
 * le bucket en contient des milliers.
 */
async function collectPresentObjects(client, prefix = '', present = new Set()) {
	for (let offset = 0; ; offset += 100) {
		const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 100, offset });
		if (error) throw new Error(`list(${prefix}) : ${error.message}`);
		if (!data?.length) break;
		for (const entry of data) {
			const full = prefix ? `${prefix}/${entry.name}` : entry.name;
			// id null = dossier, pas un objet.
			if (entry.id === null) await collectPresentObjects(client, full, present);
			else present.add(full);
		}
		if (data.length < 100) break;
	}
	return present;
}

async function uploadAll(client, paths, url) {
	console.log(`\nTéléversement de ${paths.length} fichiers vers ${url} …`);
	let done = 0;
	let failed = 0;
	for (const relative of paths) {
		const body = fs.readFileSync(path.join(ASSETS_ROOT, relative));
		const contentType = MIME[path.extname(relative).toLowerCase()] ?? 'application/octet-stream';
		const { error } = await client.storage
			.from(BUCKET)
			.upload(relative, body, { contentType, upsert: true });
		if (error) {
			failed += 1;
			console.error(`  ✗ ${relative} — ${error.message}`);
		} else {
			done += 1;
			if (done % 100 === 0) console.log(`  ${done}/${paths.length}…`);
		}
	}
	console.log(`\nTerminé : ${done} téléversés, ${failed} en échec.`);
	if (failed) process.exitCode = 1;
}

function reportUntransferable(missing) {
	const absent = missing.filter((p) => !fs.existsSync(path.join(ASSETS_ROOT, p)));
	if (!absent.length) return;
	console.log(`\n⚠ ${absent.length} fichiers manquent AUSSI sur le disque — non téléversables :`);
	for (const p of absent.slice(0, 10)) console.log(`   ${p}`);
	if (absent.length > 10) console.log(`   … et ${absent.length - 10} autres`);
}

async function main() {
	const env = readLocalEnv();
	const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		throw new Error(
			'.env.local doit définir NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.'
		);
	}
	assertLocal(url);

	const client = createClient(url, key, { auth: { persistSession: false } });
	const referenced = await collectReferencedPaths(client);

	console.log('Inventaire du bucket local…');
	const present = await collectPresentObjects(client);
	console.log(`  ${present.size} objets déjà présents`);

	const missing = [...referenced].filter((p) => !present.has(p)).sort();
	console.log(`  ${referenced.size} chemins référencés, ${missing.length} manquants`);
	reportUntransferable(missing);

	const uploadable = missing.filter((p) => fs.existsSync(path.join(ASSETS_ROOT, p)));
	if (!uploadable.length) {
		console.log('\nRien à téléverser.');
		return;
	}

	if (DRY_RUN) {
		console.log(`\n--dry-run : ${uploadable.length} fichiers seraient téléversés. Exemples :`);
		for (const p of uploadable.slice(0, 15)) console.log(`   ${p}`);
		return;
	}

	await uploadAll(client, uploadable, url);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
