// Env loading for the standalone seed scripts (tsx does not read .env files on
// its own, unlike the Next.js app). Mirrors scripts/ingest/config.ts: load
// .env.local (shared with the app), then layer .env.seed on top if present so
// seed-specific overrides (e.g. a prod SUPABASE_URL + service-role key) live
// separately from the app's dev config.

import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';

const BASE_ENV_PATH = '.env.local';
// Seed-specific overrides (gitignored). Optional: only the keys it defines win
// over .env.local; if the file is absent, nothing changes.
const SEED_ENV_PATH = '.env.seed';

dotenv.config({ path: BASE_ENV_PATH, quiet: true });
const usingSeedEnv = existsSync(SEED_ENV_PATH);
if (usingSeedEnv) {
	dotenv.config({ path: SEED_ENV_PATH, override: true, quiet: true });
}

function firstDefined(...vals: (string | undefined)[]): string | undefined {
	return vals.find((v) => v !== undefined && v !== '');
}

export interface SupabaseEnv {
	supabaseUrl: string;
	supabaseServiceRoleKey: string;
}

/**
 * Resolves the Supabase target for a seed script. When `requireServiceRole` is
 * false (e.g. --dry-run), a missing key is returned as '' instead of exiting.
 */
export function resolveSupabaseEnv(requireServiceRole = true): SupabaseEnv {
	// SUPABASE_URL is the canonical name; fall back to NEXT_PUBLIC_SUPABASE_URL
	// (what .env.local actually defines for the app) before the local default.
	const supabaseUrl =
		firstDefined(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL) ??
		'http://127.0.0.1:54321';
	const supabaseServiceRoleKey = firstDefined(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? '';

	if (requireServiceRole && !supabaseServiceRoleKey) {
		const where = usingSeedEnv ? `${SEED_ENV_PATH} or ${BASE_ENV_PATH}` : BASE_ENV_PATH;
		console.error(`✖ Missing SUPABASE_SERVICE_ROLE_KEY — set it in ${where}`);
		process.exit(1);
	}

	const envDesc = usingSeedEnv ? `${BASE_ENV_PATH} + ${SEED_ENV_PATH}` : BASE_ENV_PATH;
	console.error(`ℹ env: ${envDesc} → Supabase ${supabaseUrl}`);

	return { supabaseUrl, supabaseServiceRoleKey };
}
