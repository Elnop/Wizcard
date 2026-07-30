// Uploade les assets de template du Custom Card Studio vers Supabase Storage,
// puis remplit public.card_templates depuis le manifeste généré.
//
//   npm run card-assets -- --dry-run   # inventaire + contrôles, aucune écriture
//   npm run card-assets                # génère, vérifie, uploade, upsert
//
// Un seul point d'entrée : le manifeste, la vérification et l'upload sont trois
// étapes du même geste — un manifeste régénéré sans upload laisse la table
// désynchronisée du bucket, et l'inverse n'a pas de sens.
//
// Cible Supabase : resolveSupabaseEnv, c'est-à-dire .env.local puis .env.seed
// en override s'il existe. Basculer local <-> prod se fait en posant ou en
// retirant .env.seed, jamais par un flag. L'URL visée est loggée avant toute
// écriture, et en WARN lorsqu'elle n'est pas locale.
//
// Source des fichiers : assets/card-templates/ (gitignoré, cf. README du
// dossier). La PR d'origine committait 35 030 fichiers pour 1 Go ; on
// n'uploade que les ~1580 réellement référencés par le manifeste (~217 Mo).
//
// Idempotent : upsert Storage + upsert table. Une seconde exécution ne
// duplique rien et ne re-télé-verse que ce qui a changé de taille.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../lib/load-env';
import { createLogger } from '../lib/logger';
import { extractAll, type TemplateGeometry } from '../mse-geometry/extract';

const log = createLogger('card-assets');
const execFileAsync = promisify(execFile);

const DRY_RUN = process.argv.includes('--dry-run');
// Re-téléverse tout, même si l'objet distant a déjà la bonne taille.
const FORCE = process.argv.includes('--force');
// Réutilise le manifeste existant au lieu de rescanner le pack (~30 s).
const SKIP_MANIFESTS = process.argv.includes('--skip-manifests');

const ASSETS_ROOT = path.resolve('assets/card-templates');
const MANIFEST_PATH = path.join(ASSETS_ROOT, 'manifests', 'templates.json');
const GENERATE_SCRIPT = path.resolve('scripts/card-assets/generate-manifests.mjs');
const BUCKET = 'card-templates';
const UPLOAD_CONCURRENCY = 8;
// Racine du corpus MSE d'où la géométrie est mesurée (cf. scripts/mse-geometry).
// Les clés de la Map renvoyée par extractAll sont les id .mse-style, identiques
// aux id de card_templates : aucune normalisation à faire ici.
const GEOMETRY_CORPUS_ROOT = path.join(
	ASSETS_ROOT,
	'card-assets/v/bcdf4190b4bf/full-magic-pack/data'
);

const { supabaseUrl: SUPABASE_URL, supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
	resolveSupabaseEnv(log, !DRY_RUN);

const IS_REMOTE_TARGET = !/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(SUPABASE_URL);

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
	installerGroup?: string | null;
	positionHint?: string | null;
	tags?: string[];
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
	// Géométrie mesurée depuis le corpus MSE (scripts/mse-geometry/extract.ts).
	// NULL = non mesuré : jamais de géométrie empruntée à un autre gabarit.
	geometry: TemplateGeometry | null;
	installer_group: string | null;
	position_hint: string | null;
	tags: string[];
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

function toRow(
	template: ManifestTemplate,
	assetVersion: string,
	geometries: Map<string, TemplateGeometry>
): CardTemplateRow {
	return {
		id: template.id,
		name: template.name,
		short_name: template.shortName,
		source: template.source === 'cardconjurer' ? 'cardconjurer' : 'mse',
		quality: template.quality === 'accurate' ? 'accurate' : 'legacy',
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
		// Les clés de la Map == template.id (vérifié : 109 hits directs, aucune
		// normalisation). Pas de géométrie mesurée -> NULL, jamais de fallback.
		geometry: geometries.get(template.id) ?? null,
		installer_group: template.installerGroup ?? null,
		position_hint: template.positionHint ?? null,
		tags: template.tags ?? [],
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

/**
 * Étape 1 : (re)génère les manifestes en scannant le pack. Sous-processus plutôt
 * qu'import : generate-manifests.mjs est un module à effets de bord qui
 * s'exécute au chargement, et sharp y traite plusieurs centaines d'images.
 */
async function generateManifests(): Promise<void> {
	log.info('génération des manifestes', { source: path.basename(GENERATE_SCRIPT) });
	const started = Date.now();
	try {
		const { stdout } = await execFileAsync('node', [GENERATE_SCRIPT], {
			maxBuffer: 32 * 1024 * 1024,
		});
		log.info('manifestes générés', {
			ms: Date.now() - started,
			output: stdout.trim().split('\n').at(-1) ?? '',
		});
	} catch (error) {
		const stderr = (error as { stderr?: string }).stderr?.trim();
		log.error('génération des manifestes échouée', {
			error: stderr || (error instanceof Error ? error.message : String(error)),
			hint: 'le pack est-il bien en place ? cf. assets/card-templates/README.md',
		});
		process.exit(1);
	}
}

/**
 * Étape 2 : cohérence interne du manifeste. Un template qui annonce
 * renderMode='frame' sans aucune frame casserait le rendu côté studio ; mieux
 * vaut refuser d'uploader que publier un catalogue incohérent. L'absence de
 * fichiers sur le disque est traitée à part (assets manquants tolérés).
 */
function checkManifestCoherence(templates: ManifestTemplate[]): string[] {
	const failures: string[] = [];
	const seen = new Set<string>();
	for (const template of templates) {
		if (seen.has(template.id)) failures.push(`id dupliqué : ${template.id}`);
		seen.add(template.id);
		if (template.renderMode === 'frame' && Object.keys(template.framePaths ?? {}).length === 0)
			failures.push(`${template.id} annonce renderMode=frame sans aucune frame`);
	}
	return failures;
}

async function main(): Promise<void> {
	if (!SKIP_MANIFESTS) await generateManifests();

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

	// Bloquant : un catalogue incohérent casserait le studio pour tous les
	// utilisateurs. On le détecte AVANT d'écrire quoi que ce soit.
	const coherenceFailures = checkManifestCoherence(manifest.templates);
	if (coherenceFailures.length > 0) {
		log.error('manifeste incohérent — aucune écriture', {
			count: coherenceFailures.length,
			sample: coherenceFailures.slice(0, 3).join(' | '),
		});
		process.exit(1);
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

	// Géométrie mesurée depuis le corpus MSE : une seule passe avant l'upsert,
	// jointe par id (cf. scripts/mse-geometry/extract.ts). Un gabarit absent de
	// la Map reçoit NULL, jamais la géométrie d'un autre gabarit.
	const { geometries, report: geometryReport } = extractAll(GEOMETRY_CORPUS_ROOT);
	log.info('géométrie extraite', {
		resolved: geometryReport.resolved,
		total: geometryReport.total,
	});

	const rows = manifest.templates.map((template) =>
		toRow(template, manifest.assetVersion, geometries)
	);
	await upsertTemplates(rows);

	log.info('terminé', {
		templates: rows.length,
		uploaded,
		skipped,
		asset_version: manifest.assetVersion,
		with_geometry: rows.filter((row) => row.geometry !== null).length,
	});
}

main().catch((error: unknown) => {
	log.error('échec', { error: error instanceof Error ? error.message : String(error) });
	process.exit(1);
});
