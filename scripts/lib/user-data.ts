/**
 * Partagé par backup-user-data.ts et restore-user-data.ts : la cible Supabase
 * (local / prod), le client pg-meta, et la définition des données UTILISATEUR.
 *
 * Transport : pg-meta (`<url>/pg/query`, derrière la clé service_role) pour la
 * DB — Postgres n'est pas exposé en prod — et l'API Storage pour les fichiers.
 * pg-meta refuse les corps de requête de plus de ~1 Mo : tout ce qui envoie des
 * données doit découper (voir REQUEST_BUDGET).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const prodEnvPath = join(repoRoot, '.env.supabase.prod');
const localEnvPath = join(repoRoot, '.env.local');

/** Taille max (octets) d'une requête pg-meta, marge comprise sous la limite ~1 Mo. */
export const REQUEST_BUDGET = 700_000;

export type Row = Record<string, unknown>;

export interface TableSpec {
	/** Nom qualifié, aussi utilisé comme nom de fichier. */
	table: string;
	/** Colonne unique et triable, pour la pagination par clé. */
	key: string;
	/** Filtre SQL restreignant aux lignes utilisateur (aucun = toute la table). */
	where?: string;
}

/**
 * Données produites par les utilisateurs. Exclu car régénérable par les scripts :
 * catalogue Scryfall (seed), decks précons MTGJSON + leurs card_entries
 * (precons:sync), cartes MPC ingérées + leurs images (ingest). Exclu aussi :
 * email_change_requests (jetons éphémères).
 *
 * Ordre = ordre de restauration (les FK pointent toujours vers une table antérieure).
 */
export const USER_TABLES: TableSpec[] = [
	{ table: 'auth.users', key: 'id' },
	{ table: 'auth.identities', key: 'id' },
	{ table: 'public.profiles', key: 'id' },
	{ table: 'public.deck_folders', key: 'id' },
	{ table: 'public.decks', key: 'id', where: `source = 'user'` },
	{
		table: 'public.card_entries',
		key: 'id',
		where: `owner_id is not null or deck_id in (select id from public.decks where source = 'user')`,
	},
	{ table: 'public.custom_cards', key: 'id', where: `source_type = 'user_created'` },
	{ table: 'public.user_usage', key: 'owner_id' },
];

export interface StorageFile {
	bucket: string;
	name: string;
	mimetype?: string | null;
}

/**
 * Fichiers utilisateur du Storage. avatars : 100 % utilisateur. custom-cards :
 * l'ingest MPC y miroite aussi ses images, on ne garde que celles référencées par
 * une carte user_created.
 */
export const USER_STORAGE_SQL = `
	select bucket_id as bucket, name, metadata->>'mimetype' as mimetype
	from storage.objects where bucket_id = 'avatars'
	union all
	select o.bucket_id, o.name, o.metadata->>'mimetype' from storage.objects o
	join public.custom_cards c on c.image_storage_path = o.name and c.source_type = 'user_created'
	where o.bucket_id = 'custom-cards'
	order by 1, 2`;

export interface Target {
	name: 'local' | 'prod';
	url: string;
	serviceKey: string;
}

export function resolveTarget(prod: boolean): Target {
	if (prod) {
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
		return { name: 'prod', url: url.replace(/\/$/, ''), serviceKey };
	}
	const fileEnv = existsSync(localEnvPath) ? dotenv.parse(readFileSync(localEnvPath)) : {};
	const url = fileEnv.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = fileEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		console.error(
			`✖ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY introuvables dans ${localEnvPath}`
		);
		process.exit(2);
	}
	return { name: 'local', url: url.replace(/\/$/, ''), serviceKey };
}

export function authHeaders(target: Target): Record<string, string> {
	return { apikey: target.serviceKey, Authorization: `Bearer ${target.serviceKey}` };
}

export class QueryError extends Error {}

/** Exécute du SQL via pg-meta ; renvoie les lignes du DERNIER statement. */
export async function query<T extends Row>(target: Target, sql: string): Promise<T[]> {
	let res: Response;
	try {
		res = await fetch(`${target.url}/pg/query`, {
			method: 'POST',
			headers: { ...authHeaders(target), 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: sql }),
			signal: AbortSignal.timeout(300_000),
		});
	} catch (err) {
		throw new QueryError(`${target.name} injoignable : ${(err as Error).message}`);
	}
	const body = await res.text();
	if (!res.ok) {
		let detail = body.slice(0, 1000);
		try {
			detail = (JSON.parse(body) as { message?: string; error?: string }).message ?? detail;
		} catch {
			// corps non JSON : on garde le texte brut
		}
		throw new QueryError(`pg-meta HTTP ${res.status} : ${detail}`);
	}
	return JSON.parse(body) as T[];
}

export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Dollar-quoting avec un tag absent du contenu, pour embarquer du JSON tel quel. */
export function dollarQuote(content: string): string {
	let tag = 'data';
	while (content.includes(`$${tag}$`)) tag += '_';
	return `$${tag}$${content}$${tag}$`;
}

export async function lastMigration(target: Target): Promise<string | null> {
	const [row] = await query<{ version: string | null }>(
		target,
		`select max(version) as version from supabase_migrations.schema_migrations`
	);
	return row?.version ?? null;
}
