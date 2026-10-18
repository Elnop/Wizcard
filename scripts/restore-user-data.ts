/**
 * restore-user-data.ts — Réapplique une sauvegarde de backup-user-data.ts sur la
 * DB LOCALE (`npm run restore -- [dossier]`) ou sur la PROD (`npm run restore:prod
 * -- <dossier>`). Sans dossier : la sauvegarde la plus récente de backups/.
 *
 * Cas d'usage principal : `npm run sb:pull-users` = backup de la prod puis
 * restore --replace en local, pour développer sur les vraies données.
 *
 * Deux modes :
 *   (défaut)   fusion — insère ce qui manque (ON CONFLICT DO NOTHING), ne touche
 *              pas l'existant ; les lignes ignorées sont rapportées par table.
 *   --replace  remplace — supprime d'abord TOUTES les données utilisateur de la
 *              cible (auth.users en cascade + custom_cards user_created), puis
 *              insère. La cible devient le reflet exact de la sauvegarde.
 *
 * Atomicité : pg-meta refuse les requêtes > ~1 Mo, donc les lignes sont d'abord
 * chargées par morceaux dans un schéma de staging (_restore), puis appliquées
 * dans UNE seule transaction : soit tout passe, soit rien. Triggers coupés
 * (session_replication_role = replica) pendant l'insertion — quotas et création
 * automatique de profil ne doivent pas rejouer — puis :
 *   - contrôle d'intégrité référentielle (les FK ne sont pas vérifiées en
 *     replica) : une ligne orpheline annule toute la transaction ;
 *   - recalcul de user_usage via recompute_user_usage().
 * Les avatar_url pointant vers le Storage d'une autre instance sont réécrits
 * vers la cible. Les fichiers Storage sont ensuite ré-uploadés (upsert).
 *
 * Garde-fous : refus si la sauvegarde contient une colonne inconnue de la cible
 * (migrations en retard) ; confirmation interactive pour la prod et pour
 * --replace (--yes pour la sauter, sauf en prod où il faut taper l'hôte).
 *
 * Options : --prod, --replace, --no-storage, --yes.
 * Exit code 0 si tout est restauré, 1 si au moins un fichier Storage a échoué,
 * 2 si la restauration DB a échoué (rien n'a été appliqué).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
	authHeaders,
	dollarQuote,
	lastMigration,
	literal,
	query,
	QueryError,
	repoRoot,
	REQUEST_BUDGET,
	resolveTarget,
	USER_TABLES,
	type Row,
	type StorageFile,
	type Target,
} from './lib/user-data';

const STAGING = '_restore';

interface Manifest {
	target: string;
	url: string;
	createdAt: string;
	lastMigration: string | null;
	rows: Record<string, number>;
	storage: { files: StorageFile[]; failures: number } | 'skipped';
}

const USERS = 'auth.users';
const FOLDERS = 'public.deck_folders';
const DECKS = 'public.decks';
const ENTRIES = 'public.card_entries';

/** FK à contrôler (table, colonne, table référencée par id) : ce que replica a désactivé. */
const INTEGRITY_CHECKS: [string, string, string][] = [
	['auth.identities', 'user_id', USERS],
	['public.profiles', 'id', USERS],
	[FOLDERS, 'owner_id', USERS],
	[FOLDERS, 'parent_id', FOLDERS],
	[DECKS, 'owner_id', USERS],
	[DECKS, 'folder_id', FOLDERS],
	[ENTRIES, 'owner_id', USERS],
	[ENTRIES, 'deck_id', DECKS],
	['public.custom_cards', 'created_by', USERS],
	['public.user_usage', 'owner_id', USERS],
];

function argValue(): string | undefined {
	return process.argv.slice(2).find((a) => !a.startsWith('--'));
}

function resolveBackupDir(): string {
	const explicit = argValue();
	if (explicit) return explicit;
	const root = join(repoRoot, 'backups');
	const dirs = existsSync(root)
		? readdirSync(root)
				.map((d) => join(root, d))
				.filter((d) => existsSync(join(d, 'manifest.json')))
				.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
		: [];
	if (dirs.length === 0) {
		console.error('✖ Aucune sauvegarde dans backups/. Lance `npm run backup:prod` d’abord.');
		process.exit(2);
	}
	return dirs[0];
}

/** Réécrit les URLs d'avatar hébergées sur le Storage d'une autre instance. */
function rewriteAvatarUrls(rows: Row[], target: Target): number {
	let rewritten = 0;
	for (const row of rows) {
		const url = row.avatar_url;
		if (typeof url !== 'string') continue;
		const next = url.replace(
			/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/avatars\//,
			`${target.url}/storage/v1/object/public/avatars/`
		);
		if (next !== url) {
			row.avatar_url = next;
			rewritten++;
		}
	}
	return rewritten;
}

/** Colonnes à insérer : celles de la sauvegarde, moins les générées de la cible. */
async function insertColumns(target: Target, table: string, rows: Row[]): Promise<string[]> {
	const [schema, name] = table.split('.');
	const cols = await query<{ column_name: string; generated: boolean }>(
		target,
		`select column_name, is_generated <> 'NEVER' as generated from information_schema.columns
		 where table_schema = ${literal(schema)} and table_name = ${literal(name)}`
	);
	const known = new Map(cols.map((c) => [c.column_name, c.generated]));
	const backupCols = new Set(rows.flatMap((r) => Object.keys(r)));
	const unknown = [...backupCols].filter((c) => !known.has(c));
	if (unknown.length > 0) {
		throw new QueryError(
			`${table} : colonne(s) absente(s) de la cible : ${unknown.join(', ')}. ` +
				`La cible a-t-elle toutes les migrations ? (npm run sb:migrate)`
		);
	}
	return [...backupCols].filter((c) => !known.get(c));
}

/** Découpe en lots dont le JSON tient dans une requête pg-meta. */
function chunk(rows: Row[]): Row[][] {
	const chunks: Row[][] = [];
	let current: Row[] = [];
	let size = 0;
	for (const row of rows) {
		const rowSize = Buffer.byteLength(JSON.stringify(row)) + 1;
		if (rowSize > REQUEST_BUDGET) throw new QueryError(`ligne trop grosse (${rowSize} o)`);
		if (size + rowSize > REQUEST_BUDGET && current.length > 0) {
			chunks.push(current);
			current = [];
			size = 0;
		}
		current.push(row);
		size += rowSize;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

function applySql(
	tables: { table: string; columns: string[]; count: number }[],
	replace: boolean
): string {
	const inserts = tables
		.filter((t) => t.count > 0)
		.map(({ table, columns, count }) => {
			const cols = columns.map((c) => `"${c}"`).join(', ');
			return (
				`with ins as (insert into ${table} (${cols}) select ${cols} ` +
				`from ${STAGING}.chunks c cross join lateral jsonb_populate_recordset(null::${table}, c.rows) ` +
				`where c.tbl = ${literal(table)} on conflict do nothing returning 1)\n` +
				`insert into ${STAGING}.report select ${literal(table)}, ${count}, count(*) from ins;`
			);
		});
	const checks = INTEGRITY_CHECKS.map(
		([table, col, ref]) =>
			`  select count(*) into n from ${table} x where x.${col} is not null ` +
			`and not exists (select 1 from ${ref} r where r.id = x.${col});\n` +
			`  if n > 0 then raise exception 'restauration annulée : % ligne(s) orpheline(s) sur ${table}.${col} ` +
			`(conflit avec des données existantes ? relancer avec --replace)', n; end if;`
	).join('\n');
	return [
		'begin;',
		...(replace
			? [
					// Avant replica : les FK ON DELETE CASCADE sont des triggers.
					`delete from public.custom_cards where source_type = 'user_created';`,
					`delete from auth.users;`,
				]
			: []),
		'set local session_replication_role = replica;',
		...inserts,
		'set local session_replication_role = origin;',
		`do $$ declare n bigint; begin\n${checks}\nend $$;`,
		'select public.recompute_user_usage(id) from auth.users;',
		'commit;',
	].join('\n');
}

async function uploadFile(target: Target, dir: string, file: StorageFile): Promise<boolean> {
	const path = file.name.split('/').map(encodeURIComponent).join('/');
	try {
		const res = await fetch(`${target.url}/storage/v1/object/${file.bucket}/${path}`, {
			method: 'POST',
			headers: {
				...authHeaders(target),
				'x-upsert': 'true',
				'Content-Type': file.mimetype ?? 'application/octet-stream',
			},
			body: readFileSync(join(dir, 'storage', file.bucket, file.name)),
			signal: AbortSignal.timeout(60_000),
		});
		if (!res.ok) {
			console.error(`  ✖ ${file.bucket}/${file.name} : HTTP ${res.status} ${await res.text()}`);
			return false;
		}
		await res.body?.cancel();
		return true;
	} catch (err) {
		console.error(`  ✖ ${file.bucket}/${file.name} : ${(err as Error).message}`);
		return false;
	}
}

async function confirm(target: Target, replace: boolean): Promise<void> {
	const needsPrompt = target.name === 'prod' || (replace && !process.argv.includes('--yes'));
	if (!needsPrompt) return;
	const host = new URL(target.url).host;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const warning = replace
		? `⚠ --replace va SUPPRIMER tous les comptes et données utilisateur de ${host}.`
		: `⚠ Restauration en fusion sur ${host}.`;
	const answer =
		target.name === 'prod'
			? await rl.question(`${warning}\n  Tape l'hôte (${host}) pour confirmer : `)
			: await rl.question(`${warning}\n  Continuer ? [y/N] `);
	rl.close();
	const ok = target.name === 'prod' ? answer.trim() === host : /^y(es)?$/i.test(answer.trim());
	if (!ok) {
		console.log('Annulé.');
		process.exit(0);
	}
}

interface TablePayload {
	table: string;
	columns: string[];
	count: number;
	rows: Row[];
}

async function loadTables(dir: string, target: Target): Promise<TablePayload[]> {
	const tables: TablePayload[] = [];
	for (const { table } of USER_TABLES) {
		const rows = JSON.parse(readFileSync(join(dir, 'data', `${table}.json`), 'utf8')) as Row[];
		if (table === 'public.profiles') {
			const n = rewriteAvatarUrls(rows, target);
			if (n > 0) console.log(`  ↻ ${n} avatar_url réécrite(s) vers ${target.url}`);
		}
		const columns = await insertColumns(target, table, rows);
		tables.push({ table, rows, count: rows.length, columns });
	}
	return tables;
}

/** Staging par lots puis application en une transaction. Lève une QueryError si rien n'est appliqué. */
async function restoreDatabase(
	target: Target,
	tables: TablePayload[],
	replace: boolean
): Promise<void> {
	await query(
		target,
		`drop schema if exists ${STAGING} cascade; create schema ${STAGING};
		 revoke all on schema ${STAGING} from public;
		 create table ${STAGING}.chunks (tbl text not null, seq int not null, rows jsonb not null);
		 create table ${STAGING}.report (tbl text, backup int, inserted int);`
	);
	console.log('\n→ Chargement dans le staging');
	for (const { table, rows } of tables) {
		const chunks = chunk(rows);
		for (const [seq, part] of chunks.entries()) {
			await query(
				target,
				`insert into ${STAGING}.chunks values (${literal(table)}, ${seq}, ` +
					`${dollarQuote(JSON.stringify(part))}::jsonb)`
			);
		}
		console.log(`  ✔ ${table.padEnd(22)} ${rows.length} ligne(s), ${chunks.length} lot(s)`);
	}

	console.log('\n→ Application (une transaction)');
	await query(target, applySql(tables, replace));
	const report = await query<{ tbl: string; inserted: number }>(
		target,
		`select tbl, inserted from ${STAGING}.report`
	);
	for (const { table, count } of tables) {
		const inserted = report.find((x) => x.tbl === table)?.inserted ?? 0;
		const skipped = count - inserted;
		const note = skipped > 0 ? `  (${skipped} déjà présente(s) ou en conflit, ignorée(s))` : '';
		console.log(`  ${skipped > 0 ? '⚠' : '✔'} ${table.padEnd(22)} ${inserted}/${count}${note}`);
	}
	console.log('  ✔ intégrité référentielle OK, user_usage recalculé');
}

/** Ré-upload des fichiers Storage ; renvoie le nombre d'échecs. */
async function restoreStorage(target: Target, dir: string, files: StorageFile[]): Promise<number> {
	console.log(`\n→ Storage : ${files.length} fichier(s)`);
	let failures = 0;
	for (const file of files) {
		if (!(await uploadFile(target, dir, file))) failures++;
	}
	console.log(`  ✔ ${files.length - failures} uploadé(s), ${failures} échec(s)`);
	return failures;
}

async function main(): Promise<void> {
	const target = resolveTarget(process.argv.includes('--prod'));
	const replace = process.argv.includes('--replace');
	const withStorage = !process.argv.includes('--no-storage');
	const dir = resolveBackupDir();
	const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;

	console.log(
		`→ Restauration ${replace ? 'REMPLACEMENT' : 'fusion'} vers ${target.name} (${target.url})`
	);
	console.log(`  depuis ${dir} (${manifest.target}, ${manifest.createdAt})`);
	const targetMigration = await lastMigration(target);
	if (targetMigration !== manifest.lastMigration) {
		console.warn(
			`  ⚠ Migrations différentes : sauvegarde ${manifest.lastMigration}, cible ${targetMigration}`
		);
	}
	const tables = await loadTables(dir, target);
	await confirm(target, replace);

	// process.exit() ne laisse pas tourner un finally : le nettoyage du staging
	// précède donc explicitement la sortie en erreur.
	const dropStaging = () =>
		query(target, `drop schema if exists ${STAGING} cascade`).catch(() => undefined);
	try {
		await restoreDatabase(target, tables, replace);
	} catch (err) {
		await dropStaging();
		console.error(`\n✖ ${err instanceof QueryError ? err.message : String(err)}`);
		console.error('  Transaction annulée : aucune donnée n’a été modifiée.');
		process.exit(2);
	}
	await dropStaging();

	const failures =
		withStorage && manifest.storage !== 'skipped'
			? await restoreStorage(target, dir, manifest.storage.files)
			: 0;
	if (failures > 0) {
		console.error(`\n✖ Restauration incomplète : ${failures} fichier(s) Storage en échec.`);
		process.exit(1);
	}
	console.log('\n✔ Restauration terminée.');
}

main().catch((err: unknown) => {
	console.error(`✖ ${err instanceof QueryError ? err.message : String(err)}`);
	process.exit(2);
});
