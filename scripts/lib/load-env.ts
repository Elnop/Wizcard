// Env loading for the standalone seed scripts (tsx does not read .env files on
// its own, unlike the Next.js app). Mirrors scripts/ingest/config.ts: load
// .env.local (shared with the app), then layer .env.seed on top if present so
// seed-specific overrides (e.g. a prod SUPABASE_URL + service-role key) live
// separately from the app's dev config.

import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';
import type { Logger } from './logger';

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
 * Pass the caller's logger so the resolved target is recorded as a normal event.
 */
export function resolveSupabaseEnv(logger: Logger, requireServiceRole = true): SupabaseEnv {
	// SUPABASE_URL is the canonical name; fall back to NEXT_PUBLIC_SUPABASE_URL
	// (what .env.local actually defines for the app) before the local default.
	const supabaseUrl =
		firstDefined(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL) ??
		'http://127.0.0.1:54321';
	const supabaseServiceRoleKey = firstDefined(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? '';

	if (requireServiceRole && !supabaseServiceRoleKey) {
		const where = usingSeedEnv ? `${SEED_ENV_PATH} or ${BASE_ENV_PATH}` : BASE_ENV_PATH;
		logger.error('missing SUPABASE_SERVICE_ROLE_KEY', { expected_in: where });
		process.exit(1);
	}

	logger.info('env resolved', {
		env_files: usingSeedEnv ? `${BASE_ENV_PATH},${SEED_ENV_PATH}` : BASE_ENV_PATH,
		supabase_url: supabaseUrl,
	});

	return { supabaseUrl, supabaseServiceRoleKey };
}
