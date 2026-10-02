// Env loading for the standalone seed scripts (tsx does not read .env files on
// its own, unlike the Next.js app). Mirrors scripts/ingest/config.ts: load
// .env.local (shared with the app), then layer .env.seed on top if present so
// seed-specific overrides (e.g. a prod SUPABASE_URL + service-role key) live
// separately from the app's dev config.
//
// SEED_TARGET=prod (`npm run seed:prod`) skips that layering for the target: the
// URL + service-role key come straight from .env.supabase.prod (the Coolify env
// mirror), so seeding prod never requires editing .env.seed back and forth.

import { existsSync, readFileSync } from 'node:fs';
import * as dotenv from 'dotenv';
import type { Logger } from './logger';

const BASE_ENV_PATH = '.env.local';
// Seed-specific overrides (gitignored). Optional: only the keys it defines win
// over .env.local; if the file is absent, nothing changes.
const SEED_ENV_PATH = '.env.seed';

// Coolify env file of the prod Supabase (gitignored), read only for SEED_TARGET=prod.
const PROD_ENV_PATH = '.env.supabase.prod';
const targetProd = process.env.SEED_TARGET === 'prod';

dotenv.config({ path: BASE_ENV_PATH, quiet: true });
const usingSeedEnv = !targetProd && existsSync(SEED_ENV_PATH);
if (usingSeedEnv) {
	dotenv.config({ path: SEED_ENV_PATH, override: true, quiet: true });
}
if (targetProd) {
	// dotenv.parse, not dotenv.config: only the two target keys are taken from the
	// ~100 secrets of the Coolify file, and they override whatever .env.local set.
	const prodEnv = existsSync(PROD_ENV_PATH) ? dotenv.parse(readFileSync(PROD_ENV_PATH)) : {};
	if (!prodEnv.SERVICE_URL_SUPABASEKONG || !prodEnv.SERVICE_SUPABASESERVICE_KEY) {
		console.error(
			`✖ SEED_TARGET=prod: SERVICE_URL_SUPABASEKONG + SERVICE_SUPABASESERVICE_KEY introuvables dans ${PROD_ENV_PATH}`
		);
		process.exit(1);
	}
	process.env.SUPABASE_URL = prodEnv.SERVICE_URL_SUPABASEKONG;
	process.env.SUPABASE_SERVICE_ROLE_KEY = prodEnv.SERVICE_SUPABASESERVICE_KEY;
}
let envFiles = BASE_ENV_PATH;
if (targetProd) envFiles += `,${PROD_ENV_PATH}`;
else if (usingSeedEnv) envFiles += `,${SEED_ENV_PATH}`;

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
		const where = envFiles.split(',').reverse().join(' or ');
		logger.error('missing SUPABASE_SERVICE_ROLE_KEY', { expected_in: where });
		process.exit(1);
	}

	logger.info('env resolved', {
		env_files: envFiles,
		target: targetProd ? 'PROD' : 'default',
		supabase_url: supabaseUrl,
	});

	return { supabaseUrl, supabaseServiceRoleKey };
}
