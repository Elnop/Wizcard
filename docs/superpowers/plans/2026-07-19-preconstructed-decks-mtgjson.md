# Preconstructed Decks (MTGJSON) + Per-Deck Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import all official WotC preconstructed decks from MTGJSON into the existing `decks`/`cards` tables, surface them merged into the Decks search mode with a "Precon" badge, and introduce a per-deck `is_public` visibility toggle.

**Architecture:** Precons live in the existing `decks`/`cards` tables (no dedicated tables), discriminated by a `source` column. This reuses the entire deck UI — detail page, stats, sample hand — with zero duplication. A standalone Node script (`scripts/sync-precons.ts`) fetches MTGJSON, upserts idempotently keyed on `(source, source_deck_id)`, and skips decks whose `source_version` is unchanged. Card enrichment is delegated to the existing Scryfall enrich-worker.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + RLS), `tsx` for scripts, `@supabase/supabase-js` service-role client, `next-intl` for i18n.

**Design spec:** `docs/superpowers/specs/2026-07-19-preconstructed-decks-mtgjson-design.md`

## Global Constraints

- **No test framework exists in this project.** There is no vitest/jest. Verification is by `npx tsc --noEmit`, `npx eslint <files>`, DB migration + SQL assertions, and runtime checks in the dev server. Never write `*.test.ts` files or invent a test runner.
- **`npm run check` is NOT green at baseline** (~60 pre-existing problems in unrelated files). The gate is "no NEW problems": run `npx eslint <changed files>` and `npx tsc --noEmit`, comparing against the pre-existing baseline.
- **One `cards` row per physical copy.** No quantity column. MTGJSON `count: n` → n inserted rows. This matches `deck-store.ts` (`for (let i = 0; i < quantity; i++)`).
- **Zone is stored in `cards.tags`**, not the `cards.zone` column, via the `deck:<zone>` prefix (`setDeckZone` in `src/types/decks.ts`).
- **Migrations must be idempotent and reversible**: `add column if not exists`, `drop policy if exists` + `create policy` with identical names. Follow the pattern of `supabase/migrations/20260713130000_privacy_gate_public_reads.sql`.
- **RLS discriminates on `owner_id is null` + `is_public`, never on `source`.** The `source` column is for sync and display only.
- Migration file naming: `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`, timestamp strictly greater than `20260719130000`.
- All user-facing strings go in BOTH `messages/fr.json` and `messages/en.json`.

---

## File Structure

**Created:**

- `supabase/migrations/20260720120000_add_deck_visibility_and_precons.sql` — schema + RLS changes
- `scripts/precons/config.ts` — env, service-role Supabase client, CLI flags
- `scripts/precons/mtgjson-client.ts` — MTGJSON HTTP fetches + response types
- `scripts/precons/format-map.ts` — MTGJSON deck `type` → `DeckFormat` mapping
- `scripts/precons/db-writer.ts` — all Supabase reads/writes for the sync
- `scripts/sync-precons.ts` — orchestrator entry point

**Modified:**

- `src/types/decks.ts` — `DeckMeta.ownerId` → nullable; add `source`, `isPublic`
- `src/lib/supabase/queries/decks.ts` — `DeckDbRow` gains `owner_id: string | null`, `source`, `is_public`; add `updateDeckVisibility`
- `src/lib/deck/db/decks.ts` — `rowToDeckMeta` maps new fields; `updateDeckMeta` accepts `isPublic`
- `src/lib/deck/db/deck.server.ts` — select + map `source`, `is_public`
- `src/lib/search/types.ts` — `DeckSearchFilters.precon` tri-state + default + active count
- `src/lib/search/db/searchDecks.ts` — map new fields, apply precon filter, author fallback
- `src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx` — precon tri-state control
- `src/app/[locale]/decks/components/DeckCard/DeckCard.tsx` — "Precon" badge
- `src/app/[locale]/decks/components/DeckCard/DeckCard.module.css` — badge styles
- `src/app/[locale]/search/views/DeckSearchView.tsx` — pass `isPrecon` to DeckCard
- `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx` — visibility toggle wiring
- `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx` — visibility toggle UI
- `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.module.css` — toggle styles
- `messages/fr.json`, `messages/en.json` — new strings
- `package.json` — `precons:sync` script

**Task order rationale:** Task 1 (schema) unblocks everything. Tasks 2–5 build the sync script bottom-up (config → client → format map → writer → orchestrator). Task 6 adapts the type layer. Task 7 does search. Task 8 does the visibility toggle UI. Task 9 is end-to-end verification.

---

### Task 1: Database migration — visibility + precon columns

**Files:**

- Create: `supabase/migrations/20260720120000_add_deck_visibility_and_precons.sql`

**Interfaces:**

- Consumes: nothing (first task)
- Produces: `decks.is_public boolean not null default true`, `decks.source text not null default 'user'`, `decks.source_deck_id text`, `decks.source_version text`, nullable `decks.owner_id`, unique index `decks_source_deck_key on (source, source_deck_id)`, rewritten SELECT policies named `"Public can view all decks"` and `"Public can view deck cards"`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260720120000_add_deck_visibility_and_precons.sql`:

```sql
-- Per-deck visibility + MTGJSON preconstructed decks.
--
-- Two changes that must ship together:
--   1. decks.is_public — an explicit per-deck sharing toggle (default true, so
--      existing decks keep exactly their current visibility). It combines with
--      the profile gate from 20260713130000: a user deck is publicly readable
--      only when the OWNER PROFILE is public AND the deck itself is public.
--   2. Preconstructed decks (source='mtgjson') live in this same table with
--      owner_id NULL. profile_is_public(NULL) is false, so the existing
--      policies would hide them — hence the dedicated owner_id IS NULL branch.
--
-- RLS discriminates on owner_id/is_public, never on `source`: `source` exists
-- for the sync (idempotent upsert key) and for display (the "Precon" badge).
--
-- Idempotent + reversible: columns use IF NOT EXISTS; policies are
-- drop-if-exists then recreated under the same names.

-- ─── Columns ────────────────────────────────────────────────────────────────

alter table public.decks
  add column if not exists is_public boolean not null default true;

alter table public.decks
  add column if not exists source text not null default 'user';

alter table public.decks
  add column if not exists source_deck_id text;

alter table public.decks
  add column if not exists source_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decks_source_check'
  ) then
    alter table public.decks
      add constraint decks_source_check check (source in ('user', 'mtgjson'));
  end if;
end $$;

-- Preconstructed decks have no owner; user decks always do.
alter table public.decks alter column owner_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decks_owner_matches_source'
  ) then
    alter table public.decks
      add constraint decks_owner_matches_source
      check ((source = 'user') = (owner_id is not null));
  end if;
end $$;

-- Idempotent upsert key for the MTGJSON sync (source_deck_id = MTGJSON fileName).
create unique index if not exists decks_source_deck_key
  on public.decks (source, source_deck_id)
  where source_deck_id is not null;

-- Search filters on source; the search list orders by updated_at.
create index if not exists decks_source_idx on public.decks (source);

-- ─── RLS ────────────────────────────────────────────────────────────────────

-- decks: precons (no owner) are public on their own is_public flag; user decks
-- additionally require the owner's profile to be public. Owner always sees own.
drop policy if exists "Public can view all decks" on public.decks;
create policy "Public can view all decks"
  on public.decks for select
  to anon, authenticated
  using (
    (owner_id is null and is_public)
    or (is_public and public.profile_is_public(owner_id))
    or auth.uid() = owner_id
  );

-- cards belonging to a deck inherit that deck's visibility predicate.
drop policy if exists "Public can view deck cards" on public.cards;
create policy "Public can view deck cards"
  on public.cards for select
  to anon, authenticated
  using (
    deck_id is not null
    and exists (
      select 1 from public.decks d
      where d.id = cards.deck_id
        and (
          (d.owner_id is null and d.is_public)
          or (d.is_public and public.profile_is_public(d.owner_id))
          or auth.uid() = d.owner_id
        )
    )
  );

-- NOTE: the "Public can view collection cards" policy (owner_id set, no
-- deck_id) is deliberately left untouched — collection/wishlist visibility is
-- still governed solely by the profile gate.
```

- [ ] **Step 2: Apply the migration**

Run: `npm run sb:migrate`
Expected: output ends with `Applying migration 20260720120000_add_deck_visibility_and_precons.sql...` and no error. If Supabase is not running, run `npm run sb:start` first.

- [ ] **Step 3: Verify schema assertions**

Run this exact command (psql against the local Supabase DB):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select
  (select count(*) from information_schema.columns
     where table_name='decks' and column_name in ('is_public','source','source_deck_id','source_version')) as new_cols,
  (select is_nullable from information_schema.columns
     where table_name='decks' and column_name='owner_id') as owner_nullable,
  (select count(*) from pg_indexes
     where tablename='decks' and indexname='decks_source_deck_key') as uniq_idx,
  (select count(*) from pg_policies
     where tablename='decks' and policyname='Public can view all decks') as deck_policy;
"
```

Expected output: `new_cols = 4`, `owner_nullable = YES`, `uniq_idx = 1`, `deck_policy = 1`.

- [ ] **Step 4: Verify the owner/source constraint rejects bad rows**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
insert into public.decks (name, source, owner_id) values ('bad', 'user', null);
"
```

Expected: FAIL with `new row for relation "decks" violates check constraint "decks_owner_matches_source"`. This proves a user deck cannot exist without an owner.

- [ ] **Step 5: Verify a precon row is insertable and anon-readable**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
insert into public.decks (name, source, owner_id, source_deck_id, source_version, format)
values ('Precon Smoke Test', 'mtgjson', null, '__smoke__', 'v1', 'commander');
set role anon;
select count(*) as anon_visible from public.decks where source_deck_id = '__smoke__';
reset role;
delete from public.decks where source_deck_id = '__smoke__';
"
```

Expected: `anon_visible = 1` — the precon is readable by anonymous users through the new policy. The row is deleted at the end, leaving the DB clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260720120000_add_deck_visibility_and_precons.sql
git commit -m "feat(db): add per-deck is_public and MTGJSON precon columns"
```

---

### Task 2: Sync config + MTGJSON client

**Files:**

- Create: `scripts/precons/config.ts`
- Create: `scripts/precons/mtgjson-client.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `config.ts`: `export const supabase: SupabaseClient`, `export const flags: Flags` where `Flags = { force: boolean; dryRun: boolean; deckFile?: string; limit: number }`, `export function log(msg: string): void`.
  - `mtgjson-client.ts`: `export async function fetchMeta(): Promise<{ version: string; date: string }>`, `export async function fetchDeckList(): Promise<DeckListEntry[]>`, `export async function fetchDeck(fileName: string): Promise<MtgJsonDeck>`, and types `DeckListEntry = { code: string; fileName: string; name: string; releaseDate: string | null; type: string }`, `MtgJsonCard = { count: number; name: string; identifiers: { scryfallId?: string } }`, `MtgJsonDeck = { name: string; code: string; type: string; releaseDate: string | null; commander: MtgJsonCard[]; mainBoard: MtgJsonCard[]; sideBoard: MtgJsonCard[] }`.

- [ ] **Step 1: Write the config module**

Create `scripts/precons/config.ts`:

```typescript
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
```

- [ ] **Step 2: Write the MTGJSON client**

Create `scripts/precons/mtgjson-client.ts`:

```typescript
// HTTP access to MTGJSON's preconstructed deck files.
//
// Three endpoints:
//   Meta.json      — global {version, date}; drives the skip-if-unchanged check
//   DeckList.json  — manifest of every precon (fileName is our stable key)
//   AllDeckFiles/<fileName>.json — one deck's full card lists

const BASE = 'https://mtgjson.com/api/v5';

export interface DeckListEntry {
	code: string;
	fileName: string;
	name: string;
	releaseDate: string | null;
	type: string;
}

export interface MtgJsonCard {
	count: number;
	name: string;
	identifiers: { scryfallId?: string };
}

export interface MtgJsonDeck {
	name: string;
	code: string;
	type: string;
	releaseDate: string | null;
	commander: MtgJsonCard[];
	mainBoard: MtgJsonCard[];
	sideBoard: MtgJsonCard[];
}

// MTGJSON wraps every payload in {meta, data}. Response bodies must be fully
// consumed (res.json() does this); a non-ok body is drained to avoid leaking
// native memory, the same failure mode hit by the Scryfall ingest worker.
async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, {
		headers: { 'User-Agent': 'Wizcard/1.0 precon-sync' },
		signal: AbortSignal.timeout(60_000),
	});
	if (!res.ok) {
		await res.body?.cancel();
		throw new Error(`[mtgjson] GET ${url} → ${res.status} ${res.statusText}`);
	}
	const payload = (await res.json()) as { data: T };
	return payload.data;
}

export async function fetchMeta(): Promise<{ version: string; date: string }> {
	return getJson<{ version: string; date: string }>(`${BASE}/Meta.json`);
}

export async function fetchDeckList(): Promise<DeckListEntry[]> {
	return getJson<DeckListEntry[]>(`${BASE}/DeckList.json`);
}

export async function fetchDeck(fileName: string): Promise<MtgJsonDeck> {
	// fileName comes from DeckList.json and may contain spaces/underscores.
	return getJson<MtgJsonDeck>(`${BASE}/decks/${encodeURIComponent(fileName)}.json`);
}
```

- [ ] **Step 3: Verify the client against the live API**

Run:

```bash
npx tsx -e "
import { fetchMeta, fetchDeckList, fetchDeck } from './scripts/precons/mtgjson-client';
(async () => {
  const meta = await fetchMeta();
  console.log('version:', meta.version);
  const list = await fetchDeckList();
  console.log('decks:', list.length, '| first:', list[0].fileName, '|', list[0].type);
  const deck = await fetchDeck(list[0].fileName);
  console.log('main:', deck.mainBoard.length, 'commander:', deck.commander.length);
  console.log('sample card:', JSON.stringify(deck.mainBoard[0]?.identifiers));
})();
"
```

Expected: a semver-ish version string, a deck count in the hundreds, and a `scryfallId` present in the sample card identifiers. If `scryfallId` is missing, stop and report — the whole sync depends on it.

- [ ] **Step 4: Collect the distinct deck types (input for Task 3)**

Run:

```bash
npx tsx -e "
import { fetchDeckList } from './scripts/precons/mtgjson-client';
(async () => {
  const list = await fetchDeckList();
  const types = [...new Set(list.map((d) => d.type))].sort();
  console.log(types.join('\n'));
})();
"
```

Expected: a short list such as `Commander Deck`, `Planechase Deck`, `Archenemy Deck`, `Starter Deck`. **Record this output** — Task 3's mapping must cover every value printed here.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint scripts/precons/config.ts scripts/precons/mtgjson-client.ts`
Expected: no errors for these two files.

- [ ] **Step 6: Commit**

```bash
git add scripts/precons/config.ts scripts/precons/mtgjson-client.ts
git commit -m "feat(precons): add MTGJSON client and sync config"
```

---

### Task 3: Format mapping

**Files:**

- Create: `scripts/precons/format-map.ts`

**Interfaces:**

- Consumes: `MtgJsonDeck['type']` (a string) from Task 2.
- Produces: `export function mapDeckFormat(mtgjsonType: string): DeckFormat | null` — returns `null` for types with no equivalent in the `decks_format_check` constraint. `null` is a legal `decks.format` value, so unmapped precons are still imported (just without a format label).

**Context:** `decks.format` is constrained to `'standard' | 'modern' | 'pioneer' | 'legacy' | 'vintage' | 'commander' | 'pauper' | 'draft' | 'limited' | 'oathbreaker' | 'brawl'` (see `supabase/migrations/20260407000000_create_decks.sql:6-9`). MTGJSON types outside that set map to `null` rather than being dropped — a Planechase precon is still worth showing.

- [ ] **Step 1: Write the format map**

Create `scripts/precons/format-map.ts`, adjusting the entries to cover every type printed in Task 2 Step 4:

```typescript
// MTGJSON deck `type` → our DeckFormat. decks.format is constrained by
// decks_format_check; anything outside that set maps to null, which is a legal
// value. Unmapped precons are still imported — they just show no format label.

import type { DeckFormat } from '../../src/types/decks';

const TYPE_TO_FORMAT: Record<string, DeckFormat> = {
	'Commander Deck': 'commander',
	Commander: 'commander',
	'Brawl Deck': 'brawl',
	Brawl: 'brawl',
	'Oathbreaker Deck': 'oathbreaker',
	'Draft Set': 'draft',
	'Starter Deck': 'standard',
	'Intro Pack': 'standard',
	'Theme Deck': 'standard',
	'Event Deck': 'standard',
	'Planeswalker Deck': 'standard',
	'Challenger Deck': 'standard',
	'Duel Deck': 'legacy',
	'Premium Deck': 'legacy',
	'From the Vault': 'legacy',
	'Clash Pack': 'standard',
	'Box Set': 'legacy',
};

/**
 * Map an MTGJSON deck type to a DeckFormat, or null when there is no
 * equivalent (Planechase, Archenemy, Vanguard...). Matching is exact first,
 * then falls back to a "contains Commander" heuristic since MTGJSON has
 * introduced variants like "Commander Deck (Display)".
 */
export function mapDeckFormat(mtgjsonType: string): DeckFormat | null {
	const exact = TYPE_TO_FORMAT[mtgjsonType];
	if (exact) return exact;
	if (mtgjsonType.includes('Commander')) return 'commander';
	if (mtgjsonType.includes('Brawl')) return 'brawl';
	return null;
}
```

- [ ] **Step 2: Verify every live MTGJSON type maps as intended**

Run:

```bash
npx tsx -e "
import { fetchDeckList } from './scripts/precons/mtgjson-client';
import { mapDeckFormat } from './scripts/precons/format-map';
(async () => {
  const list = await fetchDeckList();
  const seen = new Map();
  for (const d of list) if (!seen.has(d.type)) seen.set(d.type, mapDeckFormat(d.type));
  for (const [type, fmt] of [...seen].sort()) console.log((fmt ?? 'NULL').padEnd(12), type);
})();
"
```

Expected: every MTGJSON type printed with its mapped format. Review the `NULL` rows — each must be a type that genuinely has no equivalent (Planechase, Archenemy, Vanguard). If a Commander-like or Standard-like type shows `NULL`, add it to `TYPE_TO_FORMAT` and re-run.

- [ ] **Step 3: Verify no mapped value can violate the DB constraint**

Run:

```bash
npx tsx -e "
import { fetchDeckList } from './scripts/precons/mtgjson-client';
import { mapDeckFormat } from './scripts/precons/format-map';
const ALLOWED = new Set(['standard','modern','pioneer','legacy','vintage','commander','pauper','draft','limited','oathbreaker','brawl']);
(async () => {
  const list = await fetchDeckList();
  const bad = list.map((d) => mapDeckFormat(d.type)).filter((f) => f !== null && !ALLOWED.has(f));
  console.log(bad.length === 0 ? 'OK: all mapped formats satisfy decks_format_check' : 'FAIL: ' + [...new Set(bad)].join(', '));
})();
"
```

Expected: `OK: all mapped formats satisfy decks_format_check`

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint scripts/precons/format-map.ts`
Expected: no errors for this file.

- [ ] **Step 5: Commit**

```bash
git add scripts/precons/format-map.ts
git commit -m "feat(precons): map MTGJSON deck types to DeckFormat"
```

---

### Task 4: Sync database writer

**Files:**

- Create: `scripts/precons/db-writer.ts`

**Interfaces:**

- Consumes: `supabase`, `flags`, `log` (Task 2); `MtgJsonDeck`, `MtgJsonCard` (Task 2); `mapDeckFormat` (Task 3); `setDeckZone` from `src/types/decks.ts`.
- Produces:
  - `export async function fetchSyncedVersions(): Promise<Map<string, string>>` — `source_deck_id` → `source_version` for existing precons.
  - `export async function upsertPrecon(fileName: string, deck: MtgJsonDeck, version: string): Promise<{ deckId: string; cardCount: number }>`
  - `export async function replacePreconCards(deckId: string, deck: MtgJsonDeck): Promise<number>` — returns rows inserted.

- [ ] **Step 1: Write the db writer**

Create `scripts/precons/db-writer.ts`:

```typescript
// All Supabase reads/writes for the precon sync. Runs under the service-role
// key, so RLS is bypassed — no policy grants write access to precons.

import { supabase, flags, log } from './config';
import { mapDeckFormat } from './format-map';
import type { MtgJsonDeck, MtgJsonCard } from './mtgjson-client';
import { setDeckZone, type DeckZone } from '../../src/types/decks';

/** Existing precons as source_deck_id → source_version, for the skip check. */
export async function fetchSyncedVersions(): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const { data, error } = await supabase
		.from('decks')
		.select('source_deck_id, source_version')
		.eq('source', 'mtgjson');
	if (error) throw new Error(`[precons/db] fetchSyncedVersions: ${error.message}`);
	for (const row of data ?? []) {
		const key = row.source_deck_id as string | null;
		if (key) map.set(key, (row.source_version as string | null) ?? '');
	}
	return map;
}

// MTGJSON board → our deck zone. maybeboard/tokens have no MTGJSON equivalent.
const BOARDS: { key: 'commander' | 'mainBoard' | 'sideBoard'; zone: DeckZone }[] = [
	{ key: 'commander', zone: 'commander' },
	{ key: 'mainBoard', zone: 'mainboard' },
	{ key: 'sideBoard', zone: 'sideboard' },
];

type CardInsert = {
	deck_id: string;
	owner_id: null;
	scryfall_id: string;
	tags: string[];
};

/**
 * Flatten a deck's boards into one row PER PHYSICAL COPY (count: 4 → 4 rows).
 * There is no quantity column: deck-store.ts stores copies as distinct rows,
 * and the zone lives in tags as `deck:<zone>`, not in the zone column.
 * Cards without a scryfallId are skipped — nothing could resolve them later.
 */
function buildCardInserts(deckId: string, deck: MtgJsonDeck): CardInsert[] {
	const rows: CardInsert[] = [];
	for (const { key, zone } of BOARDS) {
		const cards: MtgJsonCard[] = deck[key] ?? [];
		for (const card of cards) {
			const scryfallId = card.identifiers?.scryfallId;
			if (!scryfallId) {
				log(`  ⚠ skipping "${card.name}" — no scryfallId`);
				continue;
			}
			for (let i = 0; i < card.count; i++) {
				rows.push({
					deck_id: deckId,
					owner_id: null,
					scryfall_id: scryfallId,
					tags: setDeckZone(undefined, zone),
				});
			}
		}
	}
	return rows;
}

/**
 * Replace a precon's cards wholesale: delete then re-insert. There is no
 * natural per-copy key to upsert on, and a precon's list is immutable for a
 * given MTGJSON version, so full replacement is the simplest correct approach.
 * enriched_at is left NULL so the existing Scryfall enrich worker picks these up.
 */
export async function replacePreconCards(deckId: string, deck: MtgJsonDeck): Promise<number> {
	const rows = buildCardInserts(deckId, deck);
	if (flags.dryRun) {
		log(`  [dry-run] would replace cards with ${rows.length} rows`);
		return rows.length;
	}

	const { error: delError } = await supabase.from('cards').delete().eq('deck_id', deckId);
	if (delError) throw new Error(`[precons/db] delete cards: ${delError.message}`);

	// Chunked: a 100-card commander deck is fine in one request, but a Draft Set
	// can run to several hundred rows and PostgREST payloads have limits.
	const CHUNK = 500;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const { error } = await supabase.from('cards').insert(rows.slice(i, i + CHUNK));
		if (error) throw new Error(`[precons/db] insert cards: ${error.message}`);
	}
	return rows.length;
}

/**
 * Upsert the deck row on the (source, source_deck_id) unique index, then
 * replace its cards. owner_id stays NULL — the decks_owner_matches_source
 * constraint requires precisely that for source='mtgjson'.
 */
export async function upsertPrecon(
	fileName: string,
	deck: MtgJsonDeck,
	version: string
): Promise<{ deckId: string; cardCount: number }> {
	const payload = {
		name: deck.name,
		format: mapDeckFormat(deck.type),
		source: 'mtgjson',
		source_deck_id: fileName,
		source_version: version,
		owner_id: null,
		is_public: true,
		updated_at: new Date().toISOString(),
	};

	if (flags.dryRun) {
		log(`  [dry-run] would upsert deck "${deck.name}" (format=${payload.format ?? 'null'})`);
		const cardCount = await replacePreconCards('00000000-0000-0000-0000-000000000000', deck);
		return { deckId: 'dry-run', cardCount };
	}

	const { data, error } = await supabase
		.from('decks')
		.upsert(payload, { onConflict: 'source,source_deck_id' })
		.select('id')
		.single();
	if (error) throw new Error(`[precons/db] upsert deck "${fileName}": ${error.message}`);

	const deckId = data.id as string;
	const cardCount = await replacePreconCards(deckId, deck);
	return { deckId, cardCount };
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint scripts/precons/db-writer.ts`
Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add scripts/precons/db-writer.ts
git commit -m "feat(precons): add sync database writer"
```

---

### Task 5: Sync orchestrator + npm script

**Files:**

- Create: `scripts/sync-precons.ts`
- Modify: `package.json` (scripts block)

**Interfaces:**

- Consumes: `flags`, `log` (Task 2); `fetchMeta`, `fetchDeckList`, `fetchDeck` (Task 2); `fetchSyncedVersions`, `upsertPrecon` (Task 4).
- Produces: the `npm run precons:sync` entry point. No exported API.

- [ ] **Step 1: Write the orchestrator**

Create `scripts/sync-precons.ts`:

```typescript
// Sync MTGJSON preconstructed decks into public.decks / public.cards.
//
//   npm run precons:sync                  — sync everything that changed
//   npm run precons:sync -- --force       — re-import all, ignoring versions
//   npm run precons:sync -- --deck=NAME   — one deck by MTGJSON fileName
//   npm run precons:sync -- --dry-run     — log planned writes, touch nothing
//   npm run precons:sync -- --limit=10    — stop after N decks
//
// Card enrichment is NOT done here: rows land with enriched_at NULL and the
// existing Scryfall enrich worker fills them in, the same as MPC ingest.

import { flags, log } from './precons/config';
import { fetchMeta, fetchDeckList, fetchDeck } from './precons/mtgjson-client';
import { fetchSyncedVersions, upsertPrecon } from './precons/db-writer';

async function main(): Promise<void> {
	const started = Date.now();

	const meta = await fetchMeta();
	log(`ℹ MTGJSON version ${meta.version} (${meta.date})`);

	const all = await fetchDeckList();
	const list = flags.deckFile ? all.filter((d) => d.fileName === flags.deckFile) : all;
	if (flags.deckFile && list.length === 0) {
		log(`✖ no deck with fileName "${flags.deckFile}"`);
		process.exit(1);
	}
	const targets = flags.limit > 0 ? list.slice(0, flags.limit) : list;
	log(`ℹ ${targets.length} deck(s) to consider`);

	const synced = await fetchSyncedVersions();

	let imported = 0;
	let skipped = 0;
	let failed = 0;
	let cardRows = 0;

	for (const [i, entry] of targets.entries()) {
		const position = `[${i + 1}/${targets.length}]`;
		const current = synced.get(entry.fileName);

		if (!flags.force && current === meta.version) {
			skipped++;
			continue;
		}

		try {
			log(`${position} ${entry.name} (${entry.type})`);
			const deck = await fetchDeck(entry.fileName);
			const { cardCount } = await upsertPrecon(entry.fileName, deck, meta.version);
			cardRows += cardCount;
			imported++;
			log(`  ✓ ${cardCount} card rows`);
		} catch (err) {
			failed++;
			log(`  ✖ ${entry.fileName}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	const secs = Math.round((Date.now() - started) / 1000);
	log(
		`\n${flags.dryRun ? '[dry-run] ' : ''}done in ${secs}s — ` +
			`${imported} imported, ${skipped} up-to-date, ${failed} failed, ${cardRows} card rows`
	);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add this line to the `scripts` block immediately after the `"ingest"` entry:

```json
		"precons:sync": "NODE_ENV=production npx tsx scripts/sync-precons.ts",
```

- [ ] **Step 3: Verify dry-run touches nothing**

Run: `npm run precons:sync -- --dry-run --limit=3`
Expected: MTGJSON version line, three `[dry-run] would upsert deck ...` lines with card counts, and a final `[dry-run] done in Ns — 3 imported, 0 up-to-date, 0 failed, N card rows`.

Then confirm the DB is untouched:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select count(*) as precons from public.decks where source='mtgjson';"
```

Expected: `precons = 0`

- [ ] **Step 4: Verify a real single-deck sync**

Run: `npm run precons:sync -- --limit=1`
Expected: one `✓ N card rows` line and `1 imported, 0 up-to-date, 0 failed`.

Verify the written rows:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select d.name, d.format, d.source, d.is_public, d.owner_id is null as no_owner,
       count(c.id) as card_rows,
       count(*) filter (where c.tags @> array['deck:commander']) as commander_rows,
       count(*) filter (where c.enriched_at is null) as unenriched
from public.decks d left join public.cards c on c.deck_id = d.id
where d.source='mtgjson' group by d.id, d.name, d.format, d.source, d.is_public, d.owner_id;
"
```

Expected: one row with `source = mtgjson`, `is_public = t`, `no_owner = t`, `card_rows` > 50, and `unenriched = card_rows` (the enrich worker has not run yet).

- [ ] **Step 5: Verify idempotency — re-running skips**

Run: `npm run precons:sync -- --limit=1`
Expected: `0 imported, 1 up-to-date, 0 failed` — the version check short-circuits.

Then run: `npm run precons:sync -- --limit=1 --force`
Expected: `1 imported, 0 up-to-date, 0 failed`. Re-run the Step 4 psql query and confirm `card_rows` is **identical** to before — proving delete-then-insert does not duplicate rows.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint scripts/sync-precons.ts`
Expected: no errors for this file.

- [ ] **Step 7: Commit**

```bash
git add scripts/sync-precons.ts package.json
git commit -m "feat(precons): add MTGJSON sync orchestrator and npm script"
```

---

### Task 6: Type layer — nullable owner, source, isPublic

**Files:**

- Modify: `src/types/decks.ts:52-62`
- Modify: `src/lib/supabase/queries/decks.ts:10-20` and `:57-70`
- Modify: `src/lib/deck/db/decks.ts` (`rowToDeckMeta`, `insertDeck`, `updateDeckMeta`)
- Modify: `src/lib/deck/db/deck.server.ts`

**Interfaces:**

- Consumes: the schema from Task 1.
- Produces:
  - `DeckMeta.ownerId: string | null`, `DeckMeta.source: DeckSource`, `DeckMeta.isPublic: boolean`, and `export type DeckSource = 'user' | 'mtgjson'`.
  - `export async function updateDeckVisibility(ownerId: string, deckId: string, isPublic: boolean): Promise<void>` in `src/lib/supabase/queries/decks.ts`.
  - `updateDeckMeta` accepts `isPublic` in its updates object.

- [ ] **Step 1: Extend DeckMeta**

In `src/types/decks.ts`, replace the `DeckMeta` interface (currently at line 52) with:

```typescript
/** Where a deck came from. 'mtgjson' decks are imported precons with no owner. */
export type DeckSource = 'user' | 'mtgjson';

export interface DeckMeta {
	id: string;
	/** NULL for preconstructed decks, which belong to no user. */
	ownerId: string | null;
	name: string;
	format: DeckFormat | null;
	description: string | null;
	folderId: string | null;
	coverArtUrl: string | null;
	source: DeckSource;
	isPublic: boolean;
	createdAt: string;
	updatedAt: string;
}
```

- [ ] **Step 2: Extend the DB row type and add the visibility mutation**

In `src/lib/supabase/queries/decks.ts`, replace the `DeckDbRow` type (line 10) with:

```typescript
export type DeckDbRow = {
	id: string;
	owner_id: string | null;
	name: string;
	format: string | null;
	description: string | null;
	folder_id: string | null;
	cover_art_url: string | null;
	source: string;
	is_public: boolean;
	created_at: string;
	updated_at: string;
};
```

Then add this function immediately after `updateDeckRow`:

```typescript
export async function updateDeckVisibility(
	ownerId: string,
	deckId: string,
	isPublic: boolean
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('decks')
		.update({ is_public: isPublic, updated_at: new Date().toISOString() })
		.eq('owner_id', ownerId)
		.eq('id', deckId);
	if (error) throw new Error(`[queries/decks] updateDeckVisibility error: ${error.message}`);
}
```

- [ ] **Step 3: Map the new fields**

In `src/lib/deck/db/decks.ts`, find `rowToDeckMeta` (near the top, around line 20) and add these two properties to the object it returns, alongside the existing `coverArtUrl` mapping:

```typescript
		source: (row.source === 'mtgjson' ? 'mtgjson' : 'user') as DeckSource,
		isPublic: row.is_public ?? true,
```

Add `DeckSource` to the existing type import from `@/types/decks` in that file.

In the same file, extend `updateDeckMeta` (line 62). Change its signature and add the payload line:

```typescript
export async function updateDeckMeta(
	userId: string,
	deckId: string,
	updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl' | 'isPublic'>>
): Promise<void> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.format !== undefined) payload.format = updates.format;
	if (updates.description !== undefined) payload.description = updates.description;
	if (updates.coverArtUrl !== undefined) payload.cover_art_url = updates.coverArtUrl;
	if (updates.isPublic !== undefined) payload.is_public = updates.isPublic;
	await updateDeckRow(userId, deckId, payload);
}
```

- [ ] **Step 4: Fix insertDeck for the non-null owner path**

`insertDeck` (line 48) writes `owner_id: userId`, which is still correct — user decks always have an owner. No change needed to its body, but confirm it does not pass `source` (the column defaults to `'user'`).

- [ ] **Step 5: Update the server-side fetch**

In `src/lib/deck/db/deck.server.ts`, change the `.select(...)` string to include the new columns and add the two mapped fields to the returned object:

```typescript
const { data, error } = await supabase
	.from('decks')
	.select(
		'id, owner_id, name, format, description, cover_art_url, source, is_public, created_at, updated_at'
	)
	.eq('id', deckId)
	.maybeSingle();
if (error || !data) return null;
return {
	id: data.id as string,
	ownerId: (data.owner_id ?? null) as string | null,
	name: data.name as string,
	format: (data.format ?? null) as DeckFormat | null,
	description: (data.description ?? null) as string | null,
	folderId: null,
	coverArtUrl: (data.cover_art_url ?? null) as string | null,
	source: (data.source === 'mtgjson' ? 'mtgjson' : 'user') as DeckSource,
	isPublic: (data.is_public ?? true) as boolean,
	createdAt: data.created_at as string,
	updatedAt: data.updated_at as string,
};
```

Add `DeckSource` to that file's type imports from `@/types/decks`.

- [ ] **Step 6: Find and fix every remaining type error from the nullable ownerId**

Run: `npx tsc --noEmit 2>&1 | grep -E "ownerId|owner_id|DeckMeta|isPublic|source" | head -40`

Expected: a list of call sites that assumed `ownerId: string`. Fix each one. Known safe sites that need NO change (verify, do not edit):

- `src/app/[locale]/decks/[id]/DeckDetailClient.tsx:32` — already `meta?.ownerId ?? null`
- `src/app/[locale]/decks/[id]/DeckDetailClient.tsx:53` — `isOwner = !!user && ownerId === user.id` already yields `false` for a null owner

For any site constructing a `DeckMeta` literal (e.g. deck creation), add `source: 'user'` and `isPublic: true`.

- [ ] **Step 7: Verify the typecheck is clean**

Run: `npx tsc --noEmit`
Expected: exit code 0, no errors. This is a full-project typecheck and must pass completely.

- [ ] **Step 8: Lint the changed files**

Run: `npx eslint src/types/decks.ts src/lib/supabase/queries/decks.ts src/lib/deck/db/decks.ts src/lib/deck/db/deck.server.ts`
Expected: no errors for these files.

- [ ] **Step 9: Commit**

```bash
git add src/types/decks.ts src/lib/supabase/queries/decks.ts src/lib/deck/db/decks.ts src/lib/deck/db/deck.server.ts
git commit -m "feat(decks): make ownerId nullable, add source and isPublic to DeckMeta"
```

---

### Task 7: Search — precon filter, badge, author fallback

**Files:**

- Modify: `src/lib/search/types.ts:74-100`
- Modify: `src/lib/search/db/searchDecks.ts`
- Modify: `src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx`
- Modify: `src/app/[locale]/decks/components/DeckCard/DeckCard.tsx`
- Modify: `src/app/[locale]/decks/components/DeckCard/DeckCard.module.css`
- Modify: `messages/fr.json`, `messages/en.json`

**Interfaces:**

- Consumes: `DeckMeta.source`, `DeckMeta.isPublic` (Task 6).
- Produces: `DeckSearchFilters.precon: PreconFilter` where `export type PreconFilter = 'all' | 'only' | 'exclude'`; `DeckCard` accepts an `isPrecon?: boolean` prop.

- [ ] **Step 1: Add the filter type**

In `src/lib/search/types.ts`, add above `DeckSearchFilters`:

```typescript
/** Tri-state precon filter: show everything, only precons, or hide precons. */
export type PreconFilter = 'all' | 'only' | 'exclude';
```

Add `precon: PreconFilter;` as the last field of `DeckSearchFilters`, add `precon: 'all',` to `DEFAULT_DECK_FILTERS`, and add this term to the sum in `countActiveDeckFilters`:

```typescript
		(f.precon !== 'all' ? 1 : 0) +
```

- [ ] **Step 2: Apply the filter and author fallback in the query**

In `src/lib/search/db/searchDecks.ts`, update `rowToResult` to map the new fields and suppress the author for precons:

```typescript
function rowToResult(row: Record<string, unknown>, author: ProfileMini | null): DeckSearchResult {
	const source = row.source === 'mtgjson' ? 'mtgjson' : 'user';
	return {
		deck: {
			id: row.id as string,
			ownerId: (row.owner_id ?? null) as string | null,
			name: row.name as string,
			format: (row.format as DeckMeta['format']) ?? null,
			description: (row.description as string | null) ?? null,
			folderId: (row.folder_id as string | null) ?? null,
			coverArtUrl: (row.cover_art_url as string | null) ?? null,
			source,
			isPublic: (row.is_public ?? true) as boolean,
			createdAt: row.created_at as string,
			updatedAt: row.updated_at as string,
		},
		// Precons have no owner: the card shows a "Precon" badge instead of an author.
		authorNickname: source === 'mtgjson' ? null : (author?.nickname ?? null),
		authorAvatarUrl: source === 'mtgjson' ? null : (author?.avatar_url ?? null),
	};
}
```

Add the precon filter to the query, immediately after the `filters.formats` line:

```typescript
if (filters.precon === 'only') q = q.eq('source', 'mtgjson');
if (filters.precon === 'exclude') q = q.eq('source', 'user');
```

Then make the author batch-fetch null-safe — precon rows have `owner_id = null` and must not be sent to `.in()`:

```typescript
const ownerIds = Array.from(
	new Set(rows.map((r) => r.owner_id as string | null).filter((id): id is string => id !== null))
);
```

Add the `DeckSource` import if the file needs it; otherwise the inline literal above suffices.

- [ ] **Step 3: Add the tri-state control to the filter modal**

In `src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx`, locate the JSX block rendering the format filter and add this section immediately after it. Match the surrounding markup's class-name conventions — read the file first and reuse its existing `styles.*` names for section/label/row rather than inventing new ones:

```tsx
<div className={styles.section}>
	<label className={styles.label}>{t('preconFilterLabel')}</label>
	<div className={styles.optionRow}>
		{(['all', 'only', 'exclude'] as const).map((value) => (
			<button
				key={value}
				type="button"
				className={draft.precon === value ? styles.optionActive : styles.option}
				onClick={() => setDraft({ ...draft, precon: value })}
			>
				{t(`preconFilter_${value}`)}
			</button>
		))}
	</div>
</div>
```

The local draft-state variable may be named differently in this file (e.g. `local`, `pending`). Read the file and use its actual name and setter rather than `draft`/`setDraft`.

- [ ] **Step 4: Add the badge to DeckCard**

In `src/app/[locale]/decks/components/DeckCard/DeckCard.tsx`, add `isPrecon?: boolean;` to the `Props` type (after `authorNickname`), destructure `isPrecon = false,` in the parameter list, and render the badge inside the image zone — place it immediately before the `{authorNickname && (` block so it occupies the same top-left slot:

```tsx
{
	isPrecon && <span className={styles.preconBadge}>{t('preconBadge')}</span>;
}
```

- [ ] **Step 5: Style the badge**

Append to `src/app/[locale]/decks/components/DeckCard/DeckCard.module.css`:

```css
/* "Precon" badge, top-left on the cover art. Occupies the same slot the author
   name uses for user decks — precons never render an author, so they can't collide. */
.preconBadge {
	position: absolute;
	top: 0.5rem;
	left: 0.5rem;
	z-index: 2;
	padding: 0.15rem 0.45rem;
	border-radius: 0.25rem;
	background: rgb(0 0 0 / 0.65);
	color: #fff;
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.02em;
	text-transform: uppercase;
}
```

- [ ] **Step 6: Pass the prop from the search view**

In `src/app/[locale]/search/views/DeckSearchView.tsx`, find the `<DeckCard ... />` render inside the results map and add:

```tsx
							isPrecon={result.deck.source === 'mtgjson'}
```

The map variable may be named `d` or `result` — read the file and use its actual name.

- [ ] **Step 7: Add the i18n strings**

In `messages/fr.json`, inside the top-level `"search"` object (starts at line 679), add:

```json
			"preconFilterLabel": "Decks préconstruits",
			"preconFilter_all": "Tous",
			"preconFilter_only": "Precons uniquement",
			"preconFilter_exclude": "Sans precons",
```

In the same file, inside the `"decks"` object, add:

```json
			"preconBadge": "Precon",
```

Add the English equivalents to `messages/en.json` in the matching objects:

```json
			"preconFilterLabel": "Preconstructed decks",
			"preconFilter_all": "All",
			"preconFilter_only": "Precons only",
			"preconFilter_exclude": "No precons",
```

```json
			"preconBadge": "Precon",
```

- [ ] **Step 8: Verify types and lint**

Run:

```bash
npx tsc --noEmit && npx eslint src/lib/search/types.ts src/lib/search/db/searchDecks.ts src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx src/app/\[locale\]/decks/components/DeckCard/DeckCard.tsx src/app/\[locale\]/search/views/DeckSearchView.tsx
```

Expected: exit code 0. Any `DeckSearchFilters` literal missing the new `precon` field surfaces here — fix each one it reports.

- [ ] **Step 9: Verify in the running app**

Run `npm run dev`, then open `http://localhost:3000/fr/search` and switch to the Decks tab.

Expected, all four:

1. The precon synced in Task 5 appears in the results with a "PRECON" badge and **no** author name.
2. Opening the filter modal shows the "Decks préconstruits" tri-state control.
3. Selecting "Precons uniquement" leaves only precons; the filter count badge increments to 1.
4. Selecting "Sans precons" hides them and shows only user decks.

- [ ] **Step 10: Commit**

```bash
git add src/lib/search src/app/\[locale\]/decks/components/DeckCard src/app/\[locale\]/search/views/DeckSearchView.tsx messages/fr.json messages/en.json
git commit -m "feat(search): merge precons into deck search with badge and filter"
```

---

### Task 8: Per-deck visibility toggle

**Files:**

- Modify: `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx`
- Modify: `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.module.css`
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx:591`
- Modify: `messages/fr.json`, `messages/en.json`

**Interfaces:**

- Consumes: `updateDeckMeta` accepting `isPublic` (Task 6); `DeckMeta.isPublic` (Task 6).
- Produces: `DeckHeader` accepts `onVisibilityChange?: (isPublic: boolean) => void` and `profileIsPublic?: boolean`.

**Context:** The gate is "profile AND deck". A deck with `isPublic = true` under a private profile is still invisible to others, so the toggle must say so — otherwise the user believes they published when the profile gate hides everything.

- [ ] **Step 1: Add the toggle to DeckHeader**

In `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx`, add to the `Props` type (line 9):

```typescript
	onVisibilityChange?: (isPublic: boolean) => void;
	/** Owner's profile visibility — a public deck under a private profile stays hidden. */
	profileIsPublic?: boolean;
```

Destructure them in the parameter list (near line 34): `onVisibilityChange, profileIsPublic = true,`.

Inside the `{!readOnly && (` block at line 119, add the toggle:

```tsx
{
	onVisibilityChange && (
		<div className={styles.visibilityRow}>
			<label className={styles.visibilityToggle}>
				<input
					type="checkbox"
					checked={deck.isPublic}
					onChange={(e) => onVisibilityChange(e.target.checked)}
				/>
				<span>{t('publicDeckLabel')}</span>
			</label>
			{deck.isPublic && !profileIsPublic && (
				<p className={styles.visibilityHint}>{t('publicDeckPrivateProfileHint')}</p>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Style the toggle**

Append to `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.module.css`:

```css
.visibilityRow {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.visibilityToggle {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	cursor: pointer;
	font-size: 0.85rem;
}

/* Shown when the deck is public but the owner's profile is not: without this
   the user believes the deck is shared when the profile gate still hides it. */
.visibilityHint {
	margin: 0;
	font-size: 0.75rem;
	opacity: 0.75;
}
```

- [ ] **Step 3: Wire it in the owner view**

In `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx`, at the `<DeckHeader` render (line 591), add the handler prop. Read the surrounding code first: this file already has a deck-update handler calling `updateDeckMeta` (used by `onUpdate`) — reuse its exact pattern, including whatever local state refresh it performs, rather than writing a divergent one:

```tsx
						onVisibilityChange={(isPublic) => onUpdate({ isPublic })}
```

If `onUpdate`'s type is narrowed to `Pick<DeckMeta, 'name' | 'format' | 'description'>`, widen it to include `'isPublic'` so this compiles.

- [ ] **Step 4: Add the i18n strings**

In `messages/fr.json`, inside the `"decks"` object:

```json
			"publicDeckLabel": "Deck public",
			"publicDeckPrivateProfileHint": "Votre profil est privé : ce deck reste invisible aux autres tant que le profil n'est pas public.",
```

In `messages/en.json`, inside the matching object:

```json
			"publicDeckLabel": "Public deck",
			"publicDeckPrivateProfileHint": "Your profile is private: this deck stays hidden from others until the profile is public.",
```

- [ ] **Step 5: Verify types and lint**

Run:

```bash
npx tsc --noEmit && npx eslint src/app/\[locale\]/decks/\[id\]/components/DeckHeader/DeckHeader.tsx src/app/\[locale\]/decks/\[id\]/DeckDetailOwnerView.tsx
```

Expected: exit code 0.

- [ ] **Step 6: Verify the toggle round-trips**

With `npm run dev` running, sign in and open one of your own decks.

Expected:

1. A "Deck public" checkbox appears, checked (default `true`).
2. Unchecking it persists — reload the page and it stays unchecked.
3. Confirm in the DB:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select name, is_public from public.decks where source='user' order by updated_at desc limit 3;"
```

Expected: the deck you toggled shows `is_public = f`.

4. Open a precon's detail page (`/fr/decks/<precon-id>`) — it renders the read-only view with **no** visibility toggle and no edit controls.

- [ ] **Step 7: Verify RLS actually hides the private deck**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
set role anon;
select count(*) as anon_sees_private from public.decks where is_public = false;
reset role;
"
```

Expected: `anon_sees_private = 0` — the RLS policy hides private decks from anonymous users regardless of profile state.

- [ ] **Step 8: Commit**

```bash
git add src/app/\[locale\]/decks/\[id\] messages/fr.json messages/en.json
git commit -m "feat(decks): add per-deck public visibility toggle"
```

---

### Task 9: Full sync + end-to-end verification

**Files:**

- Modify: none (verification only, plus any fixes the run surfaces)

**Interfaces:**

- Consumes: everything from Tasks 1–8.
- Produces: a fully populated precon catalog in the local DB.

- [ ] **Step 1: Run the full sync**

Run: `npm run precons:sync`
Expected: several hundred decks imported, `0 failed`. If any fail, read the error lines — a recurring failure means a real bug to fix before proceeding, not a transient one to ignore.

- [ ] **Step 2: Verify catalog integrity**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select
  (select count(*) from public.decks where source='mtgjson') as precon_decks,
  (select count(*) from public.decks where source='mtgjson' and owner_id is not null) as bad_owner,
  (select count(*) from public.decks where source='mtgjson' and not is_public) as bad_private,
  (select count(*) from public.cards c join public.decks d on d.id=c.deck_id where d.source='mtgjson') as precon_cards,
  (select count(*) from public.decks d where d.source='mtgjson'
     and not exists (select 1 from public.cards c where c.deck_id=d.id)) as empty_decks;
"
```

Expected: `precon_decks` in the hundreds, `bad_owner = 0`, `bad_private = 0`, `precon_cards` in the tens of thousands, `empty_decks = 0`.

- [ ] **Step 3: Verify idempotency at scale**

Run: `npm run precons:sync` a second time.
Expected: `0 imported, <N> up-to-date, 0 failed`, completing in seconds. Re-run Step 2's query and confirm `precon_cards` is **unchanged** — no duplication.

- [ ] **Step 4: Verify anonymous read access**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
set role anon;
select
  (select count(*) from public.decks where source='mtgjson') as anon_decks,
  (select count(*) from public.cards c join public.decks d on d.id=c.deck_id where d.source='mtgjson') as anon_cards;
reset role;
"
```

Expected: both counts match the authenticated counts from Step 2 — precons are fully public.

- [ ] **Step 5: Verify the enrich worker picks up precon cards**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select count(*) as awaiting_enrichment from public.cards c
join public.decks d on d.id = c.deck_id
where d.source='mtgjson' and c.enriched_at is null;
"
```

Expected: a non-zero count equal to `precon_cards`. These rows are queued for the existing Scryfall enrich worker exactly like MPC cards — confirming the decoupling holds. Enriching them is a separate operation, not part of this plan.

- [ ] **Step 6: End-to-end runtime check**

With `npm run dev` running, verify all of the following:

1. `/fr/search` → Decks tab: precons appear with badges, mixed with user decks.
2. Search by name (e.g. type a known precon name) returns it.
3. Filter "Precons uniquement" → only badged decks; result count matches `precon_decks` from Step 2.
4. Click a precon → its detail page opens read-only, with the card list rendered.
5. Deck stats / mana curve render on the precon detail page.
6. Open the same precon URL in a private window (logged out) → still loads.

Note: card images may be missing until the enrich worker runs. That is expected and not a defect.

- [ ] **Step 7: Final lint gate**

Run: `npx eslint scripts/precons scripts/sync-precons.ts src/types/decks.ts src/lib/deck/db src/lib/search src/app/\[locale\]/decks src/app/\[locale\]/search`

Expected: no NEW problems versus the pre-existing baseline. Recall that `npm run check` is red at baseline in unrelated files; only regressions in the files listed above count as failures.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix(precons): address issues found in end-to-end verification"
```

If Steps 1–7 surfaced no issues, skip this commit rather than creating an empty one.

---

## Self-Review

**Spec coverage:**

| Spec section                                                                                   | Task                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| §1 Columns (`is_public`, `source`, `source_deck_id`, `source_version`, nullable owner, checks) | Task 1                                                             |
| §1 RLS rewrite (decks + deck cards)                                                            | Task 1                                                             |
| §1 Backfill (default true)                                                                     | Task 1 Step 1                                                      |
| §2 MTGJSON source (Meta/DeckList/AllDeckFiles)                                                 | Task 2                                                             |
| §2 Format mapping                                                                              | Task 3                                                             |
| §2 Pipeline: skip-if-version-unchanged, upsert, delete+reinsert                                | Tasks 4, 5                                                         |
| §2 One row per copy, zone in tags                                                              | Task 4 Step 1 (`buildCardInserts`)                                 |
| §2 Enrichment delegated to worker                                                              | Task 4 (`enriched_at` left NULL), verified Task 9 Step 5           |
| §2 Flags (`--force`, `--deck`, `--dry-run`)                                                    | Task 2 (parse), Task 5 (use + verify)                              |
| §3 Native merge, `rowToResult` mapping                                                         | Task 7 Step 2                                                      |
| §3 Precon tri-state filter                                                                     | Task 7 Steps 1, 3                                                  |
| §3 Badge, no author                                                                            | Task 7 Steps 2, 4, 5                                               |
| §3 `fetchDeckMetaServer` selects new columns                                                   | Task 6 Step 5                                                      |
| §3 Edit UI hidden for precons                                                                  | Task 6 Step 6 (existing `isOwner` logic), verified Task 8 Step 6.4 |
| §4 Visibility toggle + profile-gate hint                                                       | Task 8                                                             |
| §4 `npm run precons:sync`                                                                      | Task 5 Step 2                                                      |
| Verification section                                                                           | Task 9                                                             |

**Deviation from spec, deliberate:** the spec's §3 mentions adding `.eq('is_public', true)` as defense-in-depth in `searchDecks`. Task 7 omits it. Reason: the query is issued with the _user's_ session, so an owner must still see their own private decks; a bare `.eq('is_public', true)` would break that, and replicating the full three-branch predicate client-side duplicates the RLS policy with no security gain — RLS already enforces it authoritatively. Adding the precon `source` filter is enough. This is noted here rather than silently dropped.

**Placeholder scan:** no TBD/TODO. Every code step carries complete code. Task 7 Steps 3 and 6, and Task 8 Step 3, instruct the implementer to read the target file and match existing local variable and class names — the surrounding code was not fully read when writing this plan, so those names could not be hardcoded honestly.

**Type consistency check:**

- `DeckSource` defined in Task 6 Step 1, used in Tasks 6 and 7. Consistent.
- `PreconFilter` defined Task 7 Step 1, used Steps 2–3. Consistent.
- `DeckMeta.ownerId: string | null` (Task 6) is respected by `searchDecks`'s null-filtered `ownerIds` (Task 7 Step 2).
- `updateDeckMeta(..., { isPublic })` (Task 6 Step 3) matches the call in Task 8 Step 3.
- `upsertPrecon(fileName, deck, version)` (Task 4) matches the call site in Task 5.
- `replacePreconCards` returns `number`; `upsertPrecon` returns `{ deckId, cardCount }` — consumed as `{ cardCount }` in Task 5. Consistent.

**Known risk, flagged not hidden:** Task 4's dry-run path calls `replacePreconCards` with a fake all-zeros UUID. It returns before touching the DB (`flags.dryRun` guard is the first branch), so no write occurs — but the fake ID is a smell. If the guard is ever reordered, a dry run would issue a real delete against a nonexistent deck (harmless: it matches nothing). Task 5 Step 3 verifies dry-run leaves the DB untouched, which catches any regression here.
