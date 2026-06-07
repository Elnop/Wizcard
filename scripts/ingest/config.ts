// Centralized config + clients for the MPC ingest pipeline.
//
// Loads .env.local, resolves env vars with NEXT_PUBLIC_* fallbacks (so the same
// .env.local that powers the Next.js app works for this script without edits),
// validates required vars with a clear error, and exposes the Supabase client
// and parsed CLI flags as singletons the ingest modules import.

import * as dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

// ─── Endpoints / constants ───────────────────────────────────────────────────

export const MPCFILL_URL = 'https://mpcfill.com/2/sources/';
export const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
export const SCRYFALL_SETS_URL = 'https://api.scryfall.com/sets';
export const SCRYFALL_USER_AGENT = 'Wizcard/1.0';

// ─── Env resolution + validation ─────────────────────────────────────────────

function firstDefined(...vals: (string | undefined)[]): string | undefined {
	return vals.find((v) => v !== undefined && v !== '');
}

export interface Config {
	supabaseUrl: string;
	supabaseServiceRoleKey: string;
	googleDriveApiKey: string;
}

function loadConfig(): Config {
	// SUPABASE_URL is the canonical name; fall back to NEXT_PUBLIC_SUPABASE_URL
	// (what .env.local actually defines for the app) before the local default.
	const supabaseUrl =
		firstDefined(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL) ??
		'http://127.0.0.1:54321';
	const supabaseServiceRoleKey = firstDefined(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? '';
	const googleDriveApiKey = firstDefined(process.env.GOOGLE_DRIVE_API_KEY) ?? '';

	const missing: string[] = [];
	if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
	if (!googleDriveApiKey) missing.push('GOOGLE_DRIVE_API_KEY');

	if (missing.length > 0) {
		console.error(`Missing required env var(s): ${missing.join(', ')} — set them in .env.local`);
		process.exit(1);
	}

	return { supabaseUrl, supabaseServiceRoleKey, googleDriveApiKey };
}

export const config = loadConfig();

// ─── Supabase client (service role) ──────────────────────────────────────────

export const supabase: SupabaseClient = createClient(
	config.supabaseUrl,
	config.supabaseServiceRoleKey,
	{ auth: { persistSession: false } }
);

// ─── CLI flags ───────────────────────────────────────────────────────────────

export interface Flags {
	filterSourceId?: string;
	limitSources: number;
	skipScryfall: boolean;
	fuzzy: boolean;
	reEnrich: boolean;
	reEnrichDays: number;
	checkImageHash: boolean;
	mirrorImages: boolean;
	backfillDrivePath: boolean;
	reportPath?: string;
}

function parseFlags(argv: string[]): Flags {
	const get = (prefix: string): string | undefined =>
		argv.find((a) => a.startsWith(prefix))?.split('=')[1];

	return {
		filterSourceId: get('--source='),
		limitSources: parseInt(get('--limit=') ?? '0', 10),
		skipScryfall: argv.includes('--skip-scryfall'),
		// fuzzy opt-in only — avoid 429s on large sources
		fuzzy: argv.includes('--fuzzy'),
		reEnrich: argv.includes('--re-enrich'),
		reEnrichDays: parseInt(get('--re-enrich-days=') ?? '30', 10),
		checkImageHash: argv.includes('--check-image-hash'),
		mirrorImages: argv.includes('--mirror-images'),
		backfillDrivePath: argv.includes('--backfill-drive-path'),
		reportPath: get('--report='),
	};
}

export const flags = parseFlags(process.argv.slice(2));
