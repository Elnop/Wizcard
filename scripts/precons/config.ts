// Config + clients for the MTGJSON precon sync. Mirrors scripts/ingest/config.ts:
// loads .env.local (shared with the app), then layers .env.ingest on top if
// present so a service-role key targeting prod lives outside the app config.

import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BASE_ENV_PATH = '.env.local';
const INGEST_ENV_PATH = '.env.ingest';

dotenv.config({ path: BASE_ENV_PATH, quiet: true });
const usingIngestEnv = existsSync(INGEST_ENV_PATH);
if (usingIngestEnv) {
	dotenv.config({ path: INGEST_ENV_PATH, override: true, quiet: true });
}

function firstDefined(...vals: (string | undefined)[]): string | undefined {
	return vals.find((v) => v !== undefined && v !== '');
}

const supabaseUrl =
	firstDefined(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL) ??
	'http://127.0.0.1:54321';
const supabaseServiceRoleKey = firstDefined(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? '';

if (!supabaseServiceRoleKey) {
	const where = usingIngestEnv ? `${INGEST_ENV_PATH} or ${BASE_ENV_PATH}` : BASE_ENV_PATH;
	console.error(`Missing required env var: SUPABASE_SERVICE_ROLE_KEY — set it in ${where}`);
	process.exit(1);
}

// Surface where writes are going: this script can target prod via .env.ingest.
const envDesc = usingIngestEnv ? `${BASE_ENV_PATH} + ${INGEST_ENV_PATH} (override)` : BASE_ENV_PATH;
console.error(`ℹ env: ${envDesc} → Supabase ${supabaseUrl}`);

// Service role: the sync writes precons, which no RLS policy permits.
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: { persistSession: false },
});

export interface Flags {
	/** Re-import every deck, ignoring the source_version check. */
	force: boolean;
	/** Log planned writes without touching the database. */
	dryRun: boolean;
	/** Sync a single MTGJSON deck by fileName (debug). */
	deckFile?: string;
	/** Stop after N decks (0 = no limit). */
	limit: number;
}

function parseFlags(argv: string[]): Flags {
	const get = (prefix: string): string | undefined =>
		argv.find((a) => a.startsWith(prefix))?.split('=')[1];
	return {
		force: argv.includes('--force'),
		dryRun: argv.includes('--dry-run'),
		deckFile: get('--deck='),
		limit: parseInt(get('--limit=') ?? '0', 10),
	};
}

export const flags: Flags = parseFlags(process.argv.slice(2));

/** Progress output goes to stderr so stdout stays clean for piping. */
export function log(msg: string): void {
	console.error(msg);
}
