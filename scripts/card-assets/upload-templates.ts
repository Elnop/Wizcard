// Uploade les assets de template du Custom Card Studio vers Supabase Storage,
// puis remplit public.card_templates depuis le manifeste généré.
//
//   npm run card-assets:upload -- --dry-run     # inventaire, aucune écriture
//   npm run card-assets:upload -- --local       # cible locale, ignore .env.seed
//   npm run card-assets:upload -- --remote      # cible résolue (.env.seed = prod)
//
// La cible DOIT être explicite. resolveSupabaseEnv applique .env.local puis
// .env.seed en override s'il existe : comme .env.seed contient les creds de
// prod (il sert aux seeds prod), un upload sans flag partirait silencieusement
// en prod dès que ce fichier traîne dans le dépôt. On refuse donc de deviner.
//
// --local force http://127.0.0.1:54321 quel que soit l'environnement chargé.
// --remote accepte la cible résolue et affiche l'hôte visé avant d'écrire.
//
// Source des fichiers : assets/card-templates/ (gitignoré, cf. README du
// dossier). La PR d'origine committait 35 030 fichiers pour 1 Go ; on
// n'uploade que les ~1580 réellement référencés par le manifeste (~217 Mo).
//
// Idempotent : upsert Storage + upsert table. Une seconde exécution ne
// duplique rien et ne re-télé-verse que ce qui a changé de taille.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import { createLogger } from '../lib/logger';

const log = createLogger('card-assets');

const DRY_RUN = process.argv.includes('--dry-run');
// Re-téléverse tout, même si l'objet distant a déjà la bonne taille.
const FORCE = process.argv.includes('--force');
const TARGET_LOCAL = process.argv.includes('--local');
const TARGET_REMOTE = process.argv.includes('--remote');

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
// Clé service-role du stack Supabase local : publique par construction (elle
// est identique sur toutes les installations `supabase start`), donc la coder
// ici n'expose rien. Elle évite d'avoir à neutraliser .env.seed pour un run local.
const LOCAL_SERVICE_ROLE_KEY =
	process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!DRY_RUN && !TARGET_LOCAL && !TARGET_REMOTE) {
	log.error('cible non spécifiée', {
		hint: 'ajouter --local (stack local) ou --remote (cible de .env.seed / .env.local)',
		why: '.env.seed contient les creds de prod : deviner la cible risquerait un upload prod involontaire',
	});
	process.exit(1);
}
if (TARGET_LOCAL && TARGET_REMOTE) {
	log.error('--local et --remote sont mutuellement exclusifs');
	process.exit(1);
}

const ASSETS_ROOT = path.resolve('assets/card-templates');
const MANIFEST_PATH = path.join(ASSETS_ROOT, 'manifests', 'templates.json');
const BUCKET = 'card-templates';
const UPLOAD_CONCURRENCY = 8;

const resolved = resolveSupabaseEnv(log, !DRY_RUN && !TARGET_LOCAL);

// --local court-circuite l'env résolu : c'est le seul moyen fiable de viser le
// stack local quand un .env.seed de prod est présent.
const SUPABASE_URL = TARGET_LOCAL ? LOCAL_SUPABASE_URL : resolved.supabaseUrl;
const SUPABASE_SERVICE_ROLE_KEY = TARGET_LOCAL
	? LOCAL_SERVICE_ROLE_KEY
	: resolved.supabaseServiceRoleKey;

const IS_REMOTE_TARGET = !/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(SUPABASE_URL);

if (TARGET_LOCAL && IS_REMOTE_TARGET) {
	log.error('--local mais URL non locale', { supabase_url: SUPABASE_URL });
	process.exit(1);
}
if (TARGET_LOCAL && !SUPABASE_SERVICE_ROLE_KEY) {
	log.error('clé service-role locale introuvable', {
		hint: 'définir LOCAL_SUPABASE_SERVICE_ROLE_KEY, ou lire `supabase status`',
	});
	process.exit(1);
}

const MIME_BY_EXT: Record<string, string> = {
	'.avif': 'image/avif',
	'.gif': 'image/gif',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
};

/** Forme des entrées du manifeste produit par generate-manifests.mjs. */
interface ManifestTemplate {
	id: string;
	name: string;
	shortName: string | null;
	kind: string;
	orientation: string;
	dimensions: { width: number | null; height: number | null; dpi: number | null };
	samplePath: string | null;
	iconPath: string | null;
	framePaths: Record<string, string>;
	frameTextColors?: Record<string, unknown>;
	sampleTextColors?: unknown;
	renderMode: string;
	version: string | null;
	source?: string;
	quality?: string;
	layoutId?: string;
}

interface Manifest {
	schemaVersion: number;
	assetVersion: string;
	templates: ManifestTemplate[];
}

interface CardTemplateRow {
	id: string;
	name: string;
	short_name: string | null;
	source: string;
	quality: string;
	kind: string;
	orientation: string;
	layout_id: string | null;
	sample_path: string | null;
	icon_path: string | null;
	frame_paths: Record<string, string>;
	frame_text_colors: Record<string, unknown>;
	sample_text_colors: unknown;
	render_mode: string;
	width: number | null;
	height: number | null;
	dpi: number | null;
	asset_version: string;
	version: string | null;
}

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
	if (!_sb)
		_sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false },
		});
	return _sb;
}

async function mapWithConcurrency<T, R>(
	values: T[],
	concurrency: number,
	operation: (value: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(values.length);
	let nextIndex = 0;
	async function worker(): Promise<void> {
		while (nextIndex < values.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await operation(values[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
	return results;
}

/**
 * Les chemins du manifeste sont relatifs à `public/` dans la PR d'origine
 * ("card-assets/v/<version>/..."). On les conserve tels quels comme clés
 * Storage : ils sont déjà versionnés, donc un nouveau pack ne collisionne pas
 * avec l'ancien et le cache CDN n'a pas besoin d'être invalidé.
 */
function storageKeyFor(manifestPath: string): string {
	return manifestPath;
}

function localFileFor(manifestPath: string): string {
	return path.join(ASSETS_ROOT, manifestPath);
}

/** Tous les chemins d'assets référencés par au moins un template. */
function collectReferencedPaths(templates: ManifestTemplate[]): string[] {
	const referenced = new Set<string>();
	for (const template of templates) {
		for (const framePath of Object.values(template.framePaths ?? {})) referenced.add(framePath);
		if (template.samplePath) referenced.add(template.samplePath);
		if (template.iconPath) referenced.add(template.iconPath);
	}
	return [...referenced].sort();
}

function toRow(template: ManifestTemplate, assetVersion: string): CardTemplateRow {
	return {
		id: template.id,
		name: template.name,
		short_name: template.shortName,
		source: template.source === 'cardconjurer' ? 'cardconjurer' : 'mse',
		quality: template.quality === 'accurate' ? 'accurate' : 'legacy',
		kind: template.kind,
		orientation: template.orientation,
		layout_id: template.layoutId ?? null,
		sample_path: template.samplePath,
		icon_path: template.iconPath,
		frame_paths: template.framePaths ?? {},
		frame_text_colors: (template.frameTextColors ?? {}) as Record<string, unknown>,
		sample_text_colors: template.sampleTextColors ?? null,
		render_mode: template.renderMode,
		width: template.dimensions?.width ?? null,
		height: template.dimensions?.height ?? null,
		dpi: template.dimensions?.dpi ?? null,
		asset_version: assetVersion,
		version: template.version,
	};
}

/**
 * Objets déjà présents dans le bucket, par clé -> taille. Sert à sauter les
 * fichiers inchangés : sur une ré-exécution prod, seul le delta remonte.
 * Storage n'expose pas de listing récursif, on parcourt donc par préfixe.
 */
async function listRemoteSizes(keys: string[]): Promise<Map<string, number>> {
	const directories = new Set(keys.map((key) => path.posix.dirname(key)));
	const sizes = new Map<string, number>();

	await mapWithConcurrency([...directories], UPLOAD_CONCURRENCY, async (directory) => {
		let offset = 0;
		// Storage plafonne à 100 entrées par page par défaut ; on pagine.
		for (;;) {
			const { data, error } = await sb()
				.storage.from(BUCKET)
				.list(directory, { limit: 100, offset });
			if (error) {
				log.warn('remote listing failed', { directory, error: error.message });
				return;
			}
			if (!data || data.length === 0) return;
			for (const entry of data) {
				const size = (entry.metadata as { size?: number } | null)?.size;
				if (typeof size === 'number') sizes.set(path.posix.join(directory, entry.name), size);
			}
			if (data.length < 100) return;
			offset += data.length;
		}
	});

	return sizes;
}

async function uploadAssets(paths: string[]): Promise<{ uploaded: number; skipped: number }> {
	const remoteSizes = FORCE ? new Map<string, number>() : await listRemoteSizes(paths);
	let uploaded = 0;
	let skipped = 0;

	await mapWithConcurrency(paths, UPLOAD_CONCURRENCY, async (manifestPath, index) => {
		const key = storageKeyFor(manifestPath);
		const file = localFileFor(manifestPath);
		const localSize = (await stat(file)).size;

		if (remoteSizes.get(key) === localSize) {
			skipped += 1;
			return;
		}

		const body = await readFile(file);
		const contentType = MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
		const { error } = await sb().storage.from(BUCKET).upload(key, body, {
			contentType,
			// Frames immuables, chemins versionnés : cache long côté CDN.
			cacheControl: '31536000',
			upsert: true,
		});
		if (error) throw new Error(`upload failed for ${key}: ${error.message}`);

		uploaded += 1;
		if (uploaded % 100 === 0)
			log.info('upload progress', { uploaded, skipped, total: paths.length, index });
	});

	return { uploaded, skipped };
}

async function upsertTemplates(rows: CardTemplateRow[]): Promise<void> {
	const CHUNK = 200;
	for (let start = 0; start < rows.length; start += CHUNK) {
		const chunk = rows.slice(start, start + CHUNK);
		const { error } = await sb().from('card_templates').upsert(chunk, { onConflict: 'id' });
		if (error) throw new Error(`card_templates upsert failed: ${error.message}`);
		log.info('templates upserted', { from: start, count: chunk.length });
	}
}

async function main(): Promise<void> {
	if (!existsSync(MANIFEST_PATH)) {
		log.error('manifest introuvable', {
			expected: MANIFEST_PATH,
			hint: 'placer le pack dans assets/card-templates/ (cf. assets/card-templates/README.md)',
		});
		process.exit(1);
	}

	const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest;
	if (manifest.schemaVersion !== 1) {
		log.error('schemaVersion inattendue', { found: manifest.schemaVersion, expected: 1 });
		process.exit(1);
	}

	const referenced = collectReferencedPaths(manifest.templates);

	// Le manifeste amont référence des frames vivant dans des modules
	// .mse-include absents du pack : on les signale et on continue, sinon un
	// pack légitime bloquerait tout l'upload.
	const present: string[] = [];
	const missing: string[] = [];
	for (const manifestPath of referenced) {
		(existsSync(localFileFor(manifestPath)) ? present : missing).push(manifestPath);
	}

	const totalBytes = (
		await mapWithConcurrency(
			present,
			UPLOAD_CONCURRENCY,
			async (p) => (await stat(localFileFor(p))).size
		)
	).reduce((sum, size) => sum + size, 0);

	log.info('inventaire', {
		templates: manifest.templates.length,
		assets_referenced: referenced.length,
		assets_present: present.length,
		assets_missing: missing.length,
		bytes: totalBytes,
		asset_version: manifest.assetVersion,
		supabase_url: SUPABASE_URL,
		target: IS_REMOTE_TARGET ? 'remote' : 'local',
		dry_run: DRY_RUN,
	});

	if (missing.length > 0) {
		log.warn('assets référencés absents du pack (templates dégradés)', {
			count: missing.length,
			sample: missing.slice(0, 3).join(' | '),
		});
	}

	if (DRY_RUN) {
		log.info('dry-run : aucune écriture', {
			would_upload: present.length,
			would_upsert: manifest.templates.length,
		});
		return;
	}

	// Garde-fou : une cible distante est loggée en clair et en WARN, pour qu'un
	// upload prod involontaire saute aux yeux dans la sortie.
	const targetDigest = createHash('sha256').update(SUPABASE_URL).digest('hex').slice(0, 8);
	if (IS_REMOTE_TARGET) {
		log.warn('CIBLE DISTANTE — écriture sur un Supabase non local', {
			supabase_url: SUPABASE_URL,
			bucket: BUCKET,
		});
	}
	log.info('démarrage upload', {
		bucket: BUCKET,
		supabase_url: SUPABASE_URL,
		target: IS_REMOTE_TARGET ? 'remote' : 'local',
		target_digest: targetDigest,
	});

	const { uploaded, skipped } = await uploadAssets(present);
	log.info('assets terminés', { uploaded, skipped, total: present.length });

	const rows = manifest.templates.map((template) => toRow(template, manifest.assetVersion));
	await upsertTemplates(rows);

	log.info('terminé', {
		templates: rows.length,
		uploaded,
		skipped,
		asset_version: manifest.assetVersion,
	});
}

main().catch((error: unknown) => {
	log.error('échec', { error: error instanceof Error ? error.message : String(error) });
	process.exit(1);
});
