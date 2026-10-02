/**
 * backup-user-data.ts — Sauvegarde les données UTILISATEUR de la DB LOCALE
 * (`npm run backup`) ou de la PROD (`npm run backup:prod`).
 *
 * Seules les données produites par les utilisateurs sont exportées (périmètre :
 * USER_TABLES + USER_STORAGE_SQL dans scripts/lib/user-data.ts) ; tout ce que les
 * scripts savent régénérer (catalogue, précons, ingest MPC) est exclu.
 *
 * Sortie : backups/<cible>-<horodatage>/ (gitignoré, chmod 700) :
 *   manifest.json        cible, date, dernière migration, nb de lignes, fichiers Storage
 *   data/<table>.json    lignes brutes (to_jsonb), une table par fichier
 *   storage/<bucket>/…   fichiers des buckets avatars + custom-cards (user_created)
 * Restauration : `npm run restore -- <dossier>` (voir restore-user-data.ts).
 *
 * ⚠ Le dossier contient emails et hashes de mots de passe (auth.users) : ne
 * jamais le committer ni le partager.
 *
 * Options : --prod, --out <dossier>, --no-storage.
 * Exit code 0 si tout est sauvegardé, 1 si au moins un fichier Storage a échoué,
 * 2 si la DB est injoignable.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	authHeaders,
	lastMigration,
	literal,
	query,
	QueryError,
	repoRoot,
	resolveTarget,
	USER_STORAGE_SQL,
	USER_TABLES,
	type Row,
	type StorageFile,
	type TableSpec,
	type Target,
} from './lib/user-data';

const PAGE_SIZE = 2000;

async function dumpTable(target: Target, spec: TableSpec): Promise<Row[]> {
	const rows: Row[] = [];
	let last: string | null = null;
	for (;;) {
		const conditions: string[] = [
			spec.where ? `(${spec.where})` : null,
			last === null ? null : `${spec.key} > ${literal(last)}`,
		].filter((c): c is string => c !== null);
		const whereClause: string = conditions.length ? `where ${conditions.join(' and ')}` : '';
		const page: { r: Row }[] = await query<{ r: Row }>(
			target,
			`select to_jsonb(t) as r from (select * from ${spec.table} ${whereClause} ` +
				`order by ${spec.key} limit ${PAGE_SIZE}) t`
		);
		rows.push(...page.map((p) => p.r));
		if (page.length < PAGE_SIZE) return rows;
		last = String(page.at(-1)?.r[spec.key]);
	}
}

async function downloadFile(target: Target, file: StorageFile, outDir: string): Promise<boolean> {
	const path = file.name.split('/').map(encodeURIComponent).join('/');
	try {
		const res = await fetch(`${target.url}/storage/v1/object/${file.bucket}/${path}`, {
			headers: authHeaders(target),
			signal: AbortSignal.timeout(60_000),
		});
		if (!res.ok) {
			await res.body?.cancel();
			console.error(`  ✖ ${file.bucket}/${file.name} : HTTP ${res.status}`);
			return false;
		}
		const dest = join(outDir, 'storage', file.bucket, file.name);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
		return true;
	} catch (err) {
		console.error(`  ✖ ${file.bucket}/${file.name} : ${(err as Error).message}`);
		return false;
	}
}

function argValue(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
	const target = resolveTarget(process.argv.includes('--prod'));
	const withStorage = !process.argv.includes('--no-storage');
	const stamp = new Date()
		.toISOString()
		.replaceAll(':', '-')
		.replace(/\.\d+Z$/, 'Z');
	const outDir = argValue('--out') ?? join(repoRoot, 'backups', `${target.name}-${stamp}`);

	console.log(`→ Sauvegarde des données utilisateur ${target.name} (${target.url})`);
	console.log(`  vers ${outDir}\n`);
	mkdirSync(join(outDir, 'data'), { recursive: true });
	chmodSync(outDir, 0o700);

	const migration = await lastMigration(target);
	const counts: Record<string, number> = {};
	for (const spec of USER_TABLES) {
		const rows = await dumpTable(target, spec);
		counts[spec.table] = rows.length;
		writeFileSync(join(outDir, 'data', `${spec.table}.json`), JSON.stringify(rows, null, '\t'));
		console.log(`  ✔ ${spec.table.padEnd(22)} ${rows.length} ligne(s)`);
	}

	const saved: StorageFile[] = [];
	let storageFailures = 0;
	if (withStorage) {
		const files = await query<{ bucket: string; name: string; mimetype: string | null }>(
			target,
			USER_STORAGE_SQL
		);
		console.log(`\n→ Storage : ${files.length} fichier(s)`);
		for (const file of files) {
			if (await downloadFile(target, file, outDir)) saved.push(file);
			else storageFailures++;
		}
		console.log(`  ✔ ${saved.length} téléchargé(s), ${storageFailures} échec(s)`);
	}

	writeFileSync(
		join(outDir, 'manifest.json'),
		JSON.stringify(
			{
				target: target.name,
				url: target.url,
				createdAt: new Date().toISOString(),
				lastMigration: migration,
				rows: counts,
				storage: withStorage ? { files: saved, failures: storageFailures } : 'skipped',
			},
			null,
			'\t'
		)
	);

	if (storageFailures > 0) {
		console.error(`\n✖ Sauvegarde incomplète : ${storageFailures} fichier(s) Storage en échec.`);
		process.exit(1);
	}
	console.log(`\n✔ Sauvegarde terminée : ${outDir}`);
}

main().catch((err: unknown) => {
	console.error(`✖ ${err instanceof QueryError ? err.message : String(err)}`);
	process.exit(2);
});
