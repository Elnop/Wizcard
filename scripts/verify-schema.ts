/* eslint-disable sonarjs/no-os-command-from-path -- `docker` is resolved from PATH
   like every other dev tool in this repo (supabase, tsx); the inputs are fixed. */
/**
 * verify-schema.ts — Exécute supabase/verify_schema.sql contre la DB LOCALE.
 *
 * Lancé via `npm run sb:verify`. Vérifie que le schéma de la DB locale est
 * conforme à l'intégralité de supabase/migrations/* (tables, colonnes, RLS,
 * policies, vues, fonctions, triggers, buckets, grants sensibles).
 *
 * Pas de dépendance à installer : le SQL est piped dans le `psql` DÉJÀ présent
 * dans le conteneur Postgres géré par le CLI Supabase (`supabase start`). Le nom
 * du conteneur est dérivé de `project_id` dans supabase/config.toml
 * (→ `supabase_db_<project_id>`).
 *
 * Sortie : la grille du rapport (FAIL en haut, SUMMARY en bas). Exit code 1 si au
 * moins un FAIL, 0 sinon — exploitable en pre-commit / CI.
 *
 * Pour auditer la PROD : ce runner ne s'y connecte pas. Colle plutôt
 * supabase/verify_schema.sql dans le SQL editor prod (cf. AGENTS.md § Vérif schéma).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const sqlPath = join(repoRoot, 'supabase', 'verify_schema.sql');
const configPath = join(repoRoot, 'supabase', 'config.toml');

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

function main(): void {
	const projectId = readProjectId();
	const container = `supabase_db_${projectId}`;
	const sql = readFileSync(sqlPath, 'utf8');

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

	// Le rapport marque un échec dès qu'une ligne commence par un statut FAIL.
	const hasFailure = /\bFAIL\b/.test(out);
	if (hasFailure) {
		console.error('\n✖ Dérive de schéma détectée — voir les lignes FAIL ci-dessus.');
		process.exit(1);
	}
	console.log('\n✔ Schéma local conforme aux migrations.');
}

main();
