/* eslint-disable sonarjs/no-os-command-from-path -- `docker` is resolved from PATH
   like every other dev tool in this repo (supabase, tsx); the inputs are fixed. */
/**
 * verify-schema.ts — Exécute supabase/verify_schema.sql contre la DB LOCALE
 * (`npm run sb:verify`) ou contre la PROD (`npm run sb:verify:prod`).
 *
 * Vérifie que le schéma de la DB est conforme à l'intégralité de
 * supabase/migrations/* (tables, colonnes, RLS, policies, vues, fonctions,
 * triggers, buckets, grants sensibles). Lecture seule : le script SQL ne crée
 * qu'une table TEMPORAIRE.
 *
 * LOCAL : le SQL est piped dans le `psql` DÉJÀ présent dans le conteneur
 * Postgres géré par le CLI Supabase (`supabase start`). Le nom du conteneur est
 * dérivé de `project_id` dans supabase/config.toml (→ `supabase_db_<project_id>`).
 *
 * PROD (--prod) : Postgres n'est pas exposé (self-hosted Coolify derrière
 * Cloudflare). Le SQL passe par pg-meta, que Kong expose sur `<url>/pg/query`
 * derrière la clé service_role. pg-meta renvoie les lignes du DERNIER statement,
 * c'est-à-dire la grille du rapport. Identifiants lus depuis .env.supabase.prod
 * (SERVICE_URL_SUPABASEKONG + SERVICE_SUPABASESERVICE_KEY), surchargeables par
 * PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY dans l'environnement.
 *
 * Sortie : la grille du rapport (FAIL en haut, SUMMARY en bas). Exit code 1 si au
 * moins un FAIL, 2 si la DB est injoignable, 0 sinon — exploitable en
 * pre-commit / CI.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const sqlPath = join(repoRoot, 'supabase', 'verify_schema.sql');
const configPath = join(repoRoot, 'supabase', 'config.toml');
const prodEnvPath = join(repoRoot, '.env.supabase.prod');

const REPORT_COLUMNS = ['status', 'category', 'object', 'detail'] as const;
type ReportRow = Record<(typeof REPORT_COLUMNS)[number], string>;

function readProjectId(): string {
	const toml = readFileSync(configPath, 'utf8');
	// Parse line-by-line rather than a multiline regex over the whole file
	// (avoids super-linear backtracking on \s* runs).
	for (const line of toml.split('\n')) {
		const match = /^project_id\s?=\s?"([^"]+)"/.exec(line.trim());
		if (match) return match[1];
	}
	console.error(`✖ project_id introuvable dans ${configPath}`);
	process.exit(2);
}

function runLocal(sql: string): string {
	const container = `supabase_db_${readProjectId()}`;

	// docker exec -i <container> psql -U postgres -d postgres  (SQL via stdin)
	const res = spawnSync(
		'docker',
		['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=0'],
		{ input: sql, encoding: 'utf8' }
	);

	if (res.error) {
		if ((res.error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.error('✖ `docker` introuvable. Installe Docker ou lance `npm run sb:start`.');
		} else {
			console.error(`✖ Échec du lancement de docker : ${res.error.message}`);
		}
		process.exit(2);
	}

	const out = (res.stdout ?? '') + (res.stderr ?? '');
	process.stdout.write(out);

	if (out.includes(`No such container: ${container}`) || out.includes('is not running')) {
		console.error(
			`\n✖ Conteneur ${container} injoignable. La DB locale tourne-t-elle ? (\`npm run sb:start\`)`
		);
		process.exit(2);
	}
	return out;
}

function resolveProdTarget(): { url: string; serviceKey: string } {
	// dotenv.parse (pas dotenv.config) : on ne pollue pas process.env avec les
	// ~100 secrets du fichier Coolify.
	const fileEnv = existsSync(prodEnvPath) ? dotenv.parse(readFileSync(prodEnvPath)) : {};
	const url = process.env.PROD_SUPABASE_URL || fileEnv.SERVICE_URL_SUPABASEKONG;
	const serviceKey =
		process.env.PROD_SUPABASE_SERVICE_ROLE_KEY || fileEnv.SERVICE_SUPABASESERVICE_KEY;

	if (!url || !serviceKey) {
		console.error(
			'✖ Cible prod inconnue. Renseigne SERVICE_URL_SUPABASEKONG + SERVICE_SUPABASESERVICE_KEY\n' +
				'  dans .env.supabase.prod, ou exporte PROD_SUPABASE_URL + PROD_SUPABASE_SERVICE_ROLE_KEY.'
		);
		process.exit(2);
	}
	return { url: url.endsWith('/') ? url.slice(0, -1) : url, serviceKey };
}

/** Grille alignée façon psql, pour que les deux cibles produisent la même sortie. */
function formatGrid(rows: ReportRow[]): string {
	const widths = REPORT_COLUMNS.map((c) =>
		Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
	);
	const line = (cells: string[]) =>
		' ' + cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ');
	return [
		line([...REPORT_COLUMNS]),
		'-' + widths.map((w) => '-'.repeat(w)).join('-+--') + '-',
		...rows.map((r) => line(REPORT_COLUMNS.map((c) => String(r[c] ?? '')))),
		`(${rows.length} rows)`,
		'',
	].join('\n');
}

async function runProd(sql: string): Promise<string> {
	const { url, serviceKey } = resolveProdTarget();
	console.log(`→ Audit du schéma PROD (${url}) via pg-meta…\n`);

	let res: Response;
	try {
		res = await fetch(`${url}/pg/query`, {
			method: 'POST',
			headers: {
				apikey: serviceKey,
				Authorization: `Bearer ${serviceKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query: sql }),
			signal: AbortSignal.timeout(60_000),
		});
	} catch (err) {
		console.error(`✖ Prod injoignable : ${(err as Error).message}`);
		process.exit(2);
	}

	const body = await res.text();
	if (!res.ok) {
		console.error(`✖ pg-meta a répondu HTTP ${res.status} : ${body.slice(0, 500)}`);
		process.exit(2);
	}

	const rows = JSON.parse(body) as ReportRow[];
	if (!Array.isArray(rows) || rows.length === 0 || !('status' in rows[0])) {
		console.error(`✖ Réponse inattendue de pg-meta : ${body.slice(0, 500)}`);
		process.exit(2);
	}

	const out = formatGrid(rows);
	process.stdout.write(out);
	return out;
}

async function main(): Promise<void> {
	const prod = process.argv.includes('--prod');
	const sql = readFileSync(sqlPath, 'utf8');
	const out = prod ? await runProd(sql) : runLocal(sql);
	const target = prod ? 'prod' : 'local';

	// Le rapport marque un échec dès qu'une ligne commence par un statut FAIL.
	const hasFailure = /\bFAIL\b/.test(out);
	if (hasFailure) {
		console.error(`\n✖ Dérive de schéma ${target} détectée — voir les lignes FAIL ci-dessus.`);
		process.exit(1);
	}
	console.log(`\n✔ Schéma ${target} conforme aux migrations.`);
}

void main();
