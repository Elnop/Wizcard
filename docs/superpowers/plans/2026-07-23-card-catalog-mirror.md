# Card Catalog Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the Scryfall card catalog (EN + FR paper prints) into our own Postgres tables so downstream sub-projects can read cards from the DB instead of `api.scryfall.com`.

**Architecture:** Rename the existing user-owned `cards` table to `card_entries` (isolated first step), then add four catalog tables modeling Scryfall's identity levels — `card_definitions` (oracle/gameplay), `card_prints` (physical edition × language), `card_faces` (0..2 faces), `card_parts` (oracle→oracle relations). A two-pass streaming seed populates them from the `default_cards` bulk file.

**Tech Stack:** Supabase (Postgres + RLS), TypeScript, `@supabase/supabase-js`, `tsx` for scripts. No test framework in this project — verification is `npm run check` + runtime (`sb:reset`/`sb:migrate` + Studio + spot-checks).

## Global Constraints

- **No test framework** (no vitest/jest). Verify via `npm run check` and runtime, never by writing/running unit tests. (from spec: Verification)
- **`npm run check` is NOT green at baseline** (~60 pre-existing problems in unrelated files). Gate on "no NEW problems" — run `npx eslint <changed files>` on the files you touched, compare to baseline. (project convention)
- **Migrations are idempotent** — use `create table if not exists`, `drop … if exists` before `create`, `add constraint if not exists` patterns, matching existing migrations. (project convention)
- **Editing `config.toml` needs `sb:restart`, not `sb:reset`.** No config changes in this plan, but never confuse `sb:reset` (DB only) with restart. (project memory)
- **Seed writes via the service-role key** (bypasses RLS); tables still need explicit `grant … to service_role` because `rolbypassrls` does not grant ACL privileges. (from spec + `localized_cards` precedent)
- **Store only `{small, normal, large}`** in every `image_uris` jsonb — never png/art_crop/border_crop. (from spec: Seed)
- **Keep streaming discipline** — never buffer the whole bulk file or a ~90k in-memory map; the print→oracle mapping lives in the DB. (from spec: Seed; prior OOM memory)
- **Commit messages** end with the Co-Authored-By trailer used in this repo:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

**Migrations (created):**

- `supabase/migrations/20260723120000_rename_cards_to_card_entries.sql` — rename + recreate objects whose SQL body hardcodes `cards`.
- `supabase/migrations/20260723120001_create_card_catalog.sql` — the 4 catalog tables + indexes + RLS + grants.
- `supabase/migrations/20260723120002_drop_localized_cards.sql` — retire `localized_cards` (absorbed by `card_prints`/`card_faces`).

**TS call-site renames (modified):**

- `src/lib/supabase/queries/cards.ts` — 4 `.from('cards')`
- `src/lib/supabase/queries/decks.ts` — 6 `.from('cards')`
- `src/lib/deck/db/deck.server.ts` — 1 `.from('cards')`
- `src/lib/search/db/searchDecks.ts` — 1 `.from('cards')`

**Type (modified):**

- `src/lib/scryfall/types/scryfall.ts` — add `'reversible_card'` to `ScryfallLayout`.

**Seed (created):**

- `scripts/seed/normalize-catalog-card.ts` — pure normalization: `ScryfallCard` → `{ definition, print, faces }`.
- `scripts/seed/seed-catalog.ts` — two-pass streaming seeder.
- `package.json` — add `seed:catalog` script.

**Localized-cards removal (modified/deleted):**

- Delete `src/lib/scryfall/db/localized-cards.ts`, `src/lib/supabase/queries/localized-cards.ts`, `scripts/seed/seed-localized-cards.ts`, `scripts/seed/normalize-localized-card.ts`.
- Repoint the prefetch consumer (see Task 9).

---

## Task 1: Rename `cards` → `card_entries` (migration)

**Files:**

- Create: `supabase/migrations/20260723120000_rename_cards_to_card_entries.sql`

**Interfaces:**

- Produces: table `public.card_entries` (same columns/constraints/RLS as old `cards`), with all functions/policies/triggers whose body named `cards` recreated against `card_entries`.

Postgres `ALTER TABLE … RENAME TO` automatically follows FKs, indexes, and the _attachment_ of policies/triggers. What it does NOT rewrite is SQL text that literally names `public.cards` or `cards.<col>` inside function bodies and policy predicates. Those are recreated here. `custom_cards`, `public_cards`, `public_collection_cards`, `public_deck_cards`, `count_distinct_public_cards` are DIFFERENT objects — do not touch them except where their body queries the renamed table.

- [ ] **Step 1: Write the migration**

```sql
-- Rename the user-owned cards table (deck/collection/wishlist entries) to
-- card_entries, freeing the name `cards` and disambiguating it from the new
-- Scryfall catalog tables. ALTER … RENAME follows FKs/indexes/policy attachment
-- automatically; we recreate only the functions/policies/triggers whose SQL body
-- hardcodes the old table name.

alter table if exists public.cards rename to card_entries;

-- 1. count_distinct_public_cards: body selects `from public.cards`.
create or replace function public.count_distinct_public_cards(owner uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct scryfall_id)::int
  from public.card_entries
  where owner_id = owner
    and wishlist = false;
$$;

-- 2. Public-read policies (predicates reference cards.deck_id). Recreate on the
-- renamed table with the same predicates. These supersede whatever RENAME carried
-- over, so drop-then-create by name.
drop policy if exists "Public can view deck cards" on public.card_entries;
create policy "Public can view deck cards"
  on public.card_entries for select
  using (
    deck_id is not null
    and exists (
      select 1 from public.decks d
      where d.id = card_entries.deck_id
        and public.deck_is_publicly_visible(d.id)
    )
  );

drop policy if exists "Public can view collection cards" on public.card_entries;
create policy "Public can view collection cards"
  on public.card_entries for select
  using (
    owner_id is not null
    and deck_id is null
    and public.profile_is_public(owner_id)
  );

-- 3. Usage-quota trigger functions count `from public.cards`. Recreate them to
-- read card_entries. (Names preserved; RENAME kept the trigger attachment, but
-- the FUNCTION bodies still said public.cards.)
```

> **Implementer note:** Steps 1's SQL for the quota functions and the exact public-read predicates MUST be copied from the current definitions. Before writing, read the live bodies:
>
> - `supabase/migrations/20260711120000_add_usage_quotas.sql` (quota trigger functions: the `count(*) from public.cards` at lines ~59, ~144, ~160),
> - `supabase/migrations/20260720120000_add_deck_visibility_and_precons.sql` (latest "Public can view deck cards" predicate — use `deck_is_publicly_visible` exactly as defined there),
> - `supabase/migrations/20260713130000_privacy_gate_public_reads.sql` (collection policy predicate).
>
> Recreate each `create or replace function` verbatim except `public.cards` → `public.card_entries` and `cards.deck_id` → `card_entries.deck_id`. Append these to the migration below the block above. Do not invent predicate logic — reuse the newest existing version of each policy/function.

- [ ] **Step 2: Apply the migration to a fresh DB**

Run: `npm run sb:reset`
Expected: reset completes with no error; the migration applies. If any function references `public.cards`, the reset fails with `relation "public.cards" does not exist` — that means a body was missed; add it.

- [ ] **Step 3: Verify the rename in Studio / psql**

Run: `npm run sb:studio` (or psql). Confirm:

- `card_entries` exists, `cards` does not.
- `select public.count_distinct_public_cards('00000000-0000-0000-0000-000000000000');` returns `0` (no error).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723120000_rename_cards_to_card_entries.sql
git commit -m "$(printf 'refactor(db): rename cards -> card_entries\n\nFrees the name `cards` for the Scryfall catalog tables. Recreates the\nfunctions and public-read policies whose SQL body hardcoded public.cards.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Repoint TS call sites to `card_entries`

**Files:**

- Modify: `src/lib/supabase/queries/cards.ts` (4 sites)
- Modify: `src/lib/supabase/queries/decks.ts` (6 sites)
- Modify: `src/lib/deck/db/deck.server.ts` (1 site)
- Modify: `src/lib/search/db/searchDecks.ts` (1 site)

**Interfaces:**

- Consumes: table `card_entries` from Task 1.
- Produces: no runtime `.from('cards')` remains in `src/`.

- [ ] **Step 1: Replace every `.from('cards')` with `.from('card_entries')`**

In each file above, change `.from('cards')` → `.from('card_entries')`. The surrounding query logic (`.eq`, `.or`, `.update`, `.insert`, `.delete`, `.range`) is unchanged — only the table name string changes. Example, `src/lib/supabase/queries/cards.ts:82`:

```ts
// before
const { data, error } = await supabase.from('cards').select('*');
// after
const { data, error } = await supabase.from('card_entries').select('*');
```

- [ ] **Step 2: Verify no call site was missed**

Run: `grep -rn "from('cards')\|from(\"cards\")" src/ | grep -v node_modules`
Expected: no output (empty). `from('custom_cards')` and view names like `public_collection_cards` are fine and must remain.

- [ ] **Step 3: Type/lint the changed files (no-NEW-problems gate)**

Run: `npx eslint src/lib/supabase/queries/cards.ts src/lib/supabase/queries/decks.ts src/lib/deck/db/deck.server.ts src/lib/search/db/searchDecks.ts`
Expected: no NEW problems attributable to these edits (a table-name string change introduces none).

- [ ] **Step 4: Runtime smoke test**

Run: `npm run dev`, open the app, load a deck detail page and the collection page.
Expected: cards load (reads go through `card_entries`); no console error `relation "cards" does not exist`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/queries/cards.ts src/lib/supabase/queries/decks.ts src/lib/deck/db/deck.server.ts src/lib/search/db/searchDecks.ts
git commit -m "$(printf 'refactor: point card_entries call sites at renamed table\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Add `reversible_card` to the `ScryfallLayout` type

**Files:**

- Modify: `src/lib/scryfall/types/scryfall.ts` (the `ScryfallLayout` union, ~line 9-27)

**Interfaces:**

- Produces: `ScryfallLayout` includes `'reversible_card'`.

- [ ] **Step 1: Add the union member**

In the `ScryfallLayout` union, add `'reversible_card'` after `'modal_dfc'`:

```ts
	| 'transform'
	| 'modal_dfc'
	| 'reversible_card'
	| 'meld'
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit` (or `npm run check` and read only the TS phase)
Expected: no NEW type error from this change. (Adding a union member is safe.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/scryfall/types/scryfall.ts
git commit -m "$(printf 'fix(scryfall): add reversible_card to ScryfallLayout\n\nThe API returns this layout (e.g. Temple Garden // Temple Garden); it was\nmissing from the union.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Create the catalog tables

**Files:**

- Create: `supabase/migrations/20260723120001_create_card_catalog.sql`

**Interfaces:**

- Consumes: nothing (independent of Tasks 1-3 at the DB level, but ordered after the rename so the migration timeline is coherent).
- Produces: tables `card_definitions`, `card_prints`, `card_faces`, `card_parts` with indexes, RLS (public select), and grants (`select` to anon/authenticated; `select,insert,update,delete` to service_role).

- [ ] **Step 1: Write the migration**

```sql
-- Scryfall card catalog mirror. Public read data (like localized_cards); written
-- only by the seed via the service-role key. Modeled on Scryfall's identity levels:
-- card_definitions (oracle/gameplay) -> card_prints (edition x language) -> card_faces;
-- card_parts holds oracle->oracle relations (tokens/meld/combo).

create table if not exists public.card_definitions (
  oracle_id      uuid primary key,
  name           text not null,
  type_line      text,
  oracle_text    text,
  mana_cost      text,
  cmc            numeric,
  colors         text[],
  color_identity text[],
  keywords       text[],
  power          text,
  toughness      text,
  loyalty        text,
  defense        text,
  legalities     jsonb,
  reserved       boolean,
  edhrec_rank    int,
  layout         text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.card_prints (
  id                uuid primary key,
  oracle_id         uuid not null references public.card_definitions(oracle_id) on delete cascade,
  set               text not null,
  collector_number  text not null,
  lang              text not null,
  rarity            text,
  released_at       date,
  artist            text,
  border_color      text,
  frame             text,
  image_status      text,
  image_uris        jsonb,
  finishes          text[],
  promo             boolean,
  reprint           boolean,
  variation         boolean,
  digital           boolean,
  printed_name      text,
  printed_type_line text,
  printed_text      text,
  updated_at        timestamptz not null default now()
);

alter table public.card_prints
  drop constraint if exists card_prints_lang_check;
alter table public.card_prints
  add constraint card_prints_lang_check check (lang in ('en', 'fr'));

create unique index if not exists card_prints_set_number_lang_key
  on public.card_prints (set, collector_number, lang);
create index if not exists card_prints_oracle_id_idx
  on public.card_prints (oracle_id);

create table if not exists public.card_faces (
  print_id          uuid not null references public.card_prints(id) on delete cascade,
  face_index        smallint not null,
  name              text,
  type_line         text,
  oracle_text       text,
  mana_cost         text,
  colors            text[],
  power             text,
  toughness         text,
  loyalty           text,
  artist            text,
  illustration_id   uuid,
  image_uris        jsonb,
  printed_name      text,
  printed_type_line text,
  printed_text      text,
  primary key (print_id, face_index)
);

create table if not exists public.card_parts (
  oracle_id          uuid not null references public.card_definitions(oracle_id) on delete cascade,
  related_oracle_id  uuid not null,   -- NO strict FK: may cite an un-seeded oracle
  component          text not null,
  name               text,
  type_line          text,
  primary key (oracle_id, related_oracle_id, component)
);

-- RLS: public read; no write policies (service_role bypasses RLS but still needs grants).
alter table public.card_definitions enable row level security;
alter table public.card_prints      enable row level security;
alter table public.card_faces       enable row level security;
alter table public.card_parts       enable row level security;

drop policy if exists card_definitions_select_all on public.card_definitions;
create policy card_definitions_select_all on public.card_definitions for select using (true);
drop policy if exists card_prints_select_all on public.card_prints;
create policy card_prints_select_all on public.card_prints for select using (true);
drop policy if exists card_faces_select_all on public.card_faces;
create policy card_faces_select_all on public.card_faces for select using (true);
drop policy if exists card_parts_select_all on public.card_parts;
create policy card_parts_select_all on public.card_parts for select using (true);

grant select on public.card_definitions, public.card_prints, public.card_faces, public.card_parts
  to anon, authenticated;
grant select, insert, update, delete
  on public.card_definitions, public.card_prints, public.card_faces, public.card_parts
  to service_role;
```

- [ ] **Step 2: Apply to a fresh DB**

Run: `npm run sb:reset`
Expected: completes with no error; all four tables created.

- [ ] **Step 3: Verify in Studio**

Confirm the four tables exist with RLS enabled and a single `… _select_all` policy each.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723120001_create_card_catalog.sql
git commit -m "$(printf 'feat(db): add Scryfall card catalog tables\n\ncard_definitions / card_prints / card_faces / card_parts, public-read RLS,\nservice_role write grants.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Catalog normalization (pure function)

**Files:**

- Create: `scripts/seed/normalize-catalog-card.ts`

**Interfaces:**

- Consumes: `ScryfallCard` from `@/lib/scryfall/types/scryfall`.
- Produces:
  - types `CardDefinitionRow`, `CardPrintRow`, `CardFaceRow`
  - `toCatalogRows(card: ScryfallCard): { definition: CardDefinitionRow; print: CardPrintRow; faces: CardFaceRow[] } | null`
    — returns `null` when the card must be skipped (lang not in en/fr, or no `games` including `paper`, or missing id/oracle_id/set/collector_number).

This is a pure module (no DB, no I/O) so it is trivially reasoned about. Faces come from `card.card_faces` when present (each sub-face's printed_* and, if present, per-face image_uris); the discriminant between "2 images (DFC)" and "2 texts / 1 image (split/adventure)" is preserved by whether each face row carries `image_uris`.

- [ ] **Step 1: Write the module**

```ts
// Pure normalization: a Scryfall card object -> catalog rows for the four tables.
// No DB, no I/O. Faces are read from card.card_faces (printed_* + per-face image
// when present); split/adventure keep 2 face rows but only the root image (their
// faces have no image_uris), while transform/modal_dfc/reversible carry image_uris
// on each face.

import type { ScryfallCard, ScryfallImageUris } from '@/lib/scryfall/types/scryfall';

type Img3 = Pick<ScryfallImageUris, 'small' | 'normal' | 'large'>;

function pick3(uris: ScryfallImageUris | undefined): Img3 | null {
	if (!uris) return null;
	return { small: uris.small, normal: uris.normal, large: uris.large };
}

export interface CardDefinitionRow {
	oracle_id: string;
	name: string;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	cmc: number | null;
	colors: string[] | null;
	color_identity: string[] | null;
	keywords: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
	defense: string | null;
	legalities: unknown;
	reserved: boolean | null;
	edhrec_rank: number | null;
	layout: string | null;
}

export interface CardPrintRow {
	id: string;
	oracle_id: string;
	set: string;
	collector_number: string;
	lang: string;
	rarity: string | null;
	released_at: string | null;
	artist: string | null;
	border_color: string | null;
	frame: string | null;
	image_status: string | null;
	image_uris: Img3 | null;
	finishes: string[] | null;
	promo: boolean | null;
	reprint: boolean | null;
	variation: boolean | null;
	digital: boolean | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
}

export interface CardFaceRow {
	print_id: string;
	face_index: number;
	name: string | null;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	colors: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
	artist: string | null;
	illustration_id: string | null;
	image_uris: Img3 | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
}

const KEPT_LANGS = new Set(['en', 'fr']);

export function toCatalogRows(
	card: ScryfallCard
): { definition: CardDefinitionRow; print: CardPrintRow; faces: CardFaceRow[] } | null {
	if (!card.id || !card.oracle_id || !card.set || !card.collector_number) return null;
	if (!KEPT_LANGS.has(card.lang)) return null;
	if (!card.games?.includes('paper')) return null;

	const definition: CardDefinitionRow = {
		oracle_id: card.oracle_id,
		name: card.name,
		type_line: card.type_line ?? null,
		oracle_text: card.oracle_text ?? null,
		mana_cost: card.mana_cost ?? null,
		cmc: card.cmc ?? null,
		colors: card.colors ?? null,
		color_identity: card.color_identity ?? null,
		keywords: card.keywords ?? null,
		power: card.power ?? null,
		toughness: card.toughness ?? null,
		loyalty: card.loyalty ?? null,
		defense: card.defense ?? null,
		legalities: card.legalities ?? null,
		reserved: card.reserved ?? null,
		edhrec_rank: card.edhrec_rank ?? null,
		layout: card.layout ?? null,
	};

	const print: CardPrintRow = {
		id: card.id,
		oracle_id: card.oracle_id,
		set: card.set,
		collector_number: card.collector_number,
		lang: card.lang,
		rarity: card.rarity ?? null,
		released_at: card.released_at ?? null,
		artist: card.artist ?? null,
		border_color: card.border_color ?? null,
		frame: card.frame ?? null,
		image_status: card.image_status ?? null,
		image_uris: pick3(card.image_uris),
		finishes: card.finishes ?? null,
		promo: card.promo ?? null,
		reprint: card.reprint ?? null,
		variation: card.variation ?? null,
		digital: card.digital ?? null,
		printed_name: card.printed_name ?? null,
		printed_type_line: card.printed_type_line ?? null,
		printed_text: card.printed_text ?? null,
	};

	const faces: CardFaceRow[] = (card.card_faces ?? []).map((f, i) => ({
		print_id: card.id,
		face_index: i,
		name: f.name ?? null,
		type_line: f.type_line ?? null,
		oracle_text: f.oracle_text ?? null,
		mana_cost: f.mana_cost ?? null,
		colors: f.colors ?? null,
		power: f.power ?? null,
		toughness: f.toughness ?? null,
		loyalty: f.loyalty ?? null,
		artist: f.artist ?? null,
		illustration_id: f.illustration_id ?? null,
		image_uris: pick3(f.image_uris),
		printed_name: f.printed_name ?? null,
		printed_type_line: f.printed_type_line ?? null,
		printed_text: f.printed_text ?? null,
	}));

	return { definition, print, faces };
}
```

- [ ] **Step 2: Type-check the module**

Run: `npx tsc --noEmit`
Expected: no NEW error. If `ScryfallCardFace.mana_cost` being required (not optional) causes an issue, it is already `string` in the type — `f.mana_cost ?? null` is still valid.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed/normalize-catalog-card.ts
git commit -m "$(printf 'feat(seed): pure normalization ScryfallCard -> catalog rows\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Two-pass catalog seeder — pass 1 (definitions/prints/faces)

**Files:**

- Create: `scripts/seed/seed-catalog.ts`
- Modify: `package.json` (add `seed:catalog` script)

**Interfaces:**

- Consumes: `toCatalogRows` from Task 5; the `default_cards` bulk URL from `/bulk-data`.
- Produces: after a run, `card_definitions`/`card_prints`/`card_faces` are populated; pass 2 (Task 7) is added in the next task. This task ships pass 1 as a runnable seed.

Model on `scripts/seed/seed-localized-cards.ts` (streaming line-by-line via `readline` over `Readable.fromWeb`, service-role client, batched upserts, `--dry-run`/`--limit` flags).

- [ ] **Step 1: Write pass-1 seeder**

```ts
// Two-pass streaming seed of the Scryfall card catalog from the default_cards bulk.
// Pass 1 (this file): explode each kept card into card_definitions / card_prints /
// card_faces. Pass 2 (added in the next task) resolves all_parts into card_parts.
//
//   npm run seed:catalog                 -- seed against $SUPABASE_URL
//   npm run seed:catalog -- --dry-run    -- normalize/count without writing
//   npm run seed:catalog -- --limit=N    -- stop after N kept cards
//
// Streams the bulk (never buffers the whole file). Writes via the service-role key.

import { createInterface } from 'node:readline';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
	toCatalogRows,
	type CardDefinitionRow,
	type CardPrintRow,
	type CardFaceRow,
} from './normalize-catalog-card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BULK_META_URL = 'https://api.scryfall.com/bulk-data';
const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';
const UPSERT_BATCH = 500;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 0;

if (!SUPABASE_SERVICE_ROLE_KEY && !dryRun) {
	console.error('✖ Missing SUPABASE_SERVICE_ROLE_KEY (required unless --dry-run)');
	process.exit(1);
}

let _sb: SupabaseClient | null = null;
function sb() {
	if (!_sb)
		_sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false },
		});
	return _sb;
}

async function bulkUrl(type: string): Promise<string> {
	const res = await fetch(BULK_META_URL, {
		headers: { 'User-Agent': UA, Accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`GET /bulk-data failed: HTTP ${res.status}`);
	const json = (await res.json()) as {
		data: Array<{ type: string; download_uri: string; size: number }>;
	};
	const entry = json.data.find((b) => b.type === type);
	if (!entry) throw new Error(`${type} entry not found in /bulk-data`);
	console.log(`ℹ ${type}: ${(entry.size / 1e6).toFixed(0)} MB — ${entry.download_uri}`);
	return entry.download_uri;
}

async function openBulkLines(url: string) {
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok || !res.body) throw new Error(`bulk download failed: HTTP ${res.status}`);
	const { Readable } = await import('node:stream');
	const nodeStream = Readable.fromWeb(res.body as never);
	return createInterface({ input: nodeStream, crlfDelay: Infinity });
}

function parseLine(line: string): ScryfallCard | null {
	const trimmed = line.trim().replace(/,$/, '');
	if (trimmed === '' || trimmed === '[' || trimmed === ']') return null;
	try {
		return JSON.parse(trimmed) as ScryfallCard;
	} catch {
		return null;
	}
}

async function flushDefs(rows: CardDefinitionRow[]) {
	if (rows.length === 0 || dryRun) return;
	const { error } = await sb().from('card_definitions').upsert(rows, { onConflict: 'oracle_id' });
	if (error) throw new Error(`card_definitions upsert failed: ${error.message}`);
}
async function flushPrints(rows: CardPrintRow[]) {
	if (rows.length === 0 || dryRun) return;
	const { error } = await sb().from('card_prints').upsert(rows, { onConflict: 'id' });
	if (error) throw new Error(`card_prints upsert failed: ${error.message}`);
}
async function flushFaces(printIds: string[], rows: CardFaceRow[]) {
	if (dryRun) return;
	// Replace faces for the prints in this batch: delete then insert (a print's face
	// set is small and fully known here).
	if (printIds.length > 0) {
		const { error: delErr } = await sb().from('card_faces').delete().in('print_id', printIds);
		if (delErr) throw new Error(`card_faces delete failed: ${delErr.message}`);
	}
	if (rows.length > 0) {
		const { error } = await sb().from('card_faces').insert(rows);
		if (error) throw new Error(`card_faces insert failed: ${error.message}`);
	}
}

async function pass1(): Promise<void> {
	const url = await bulkUrl('default_cards');
	const rl = await openBulkLines(url);

	let seen = 0;
	let kept = 0;
	let defs: CardDefinitionRow[] = [];
	let prints: CardPrintRow[] = [];
	let faces: CardFaceRow[] = [];
	let facePrintIds: string[] = [];

	async function flushAll() {
		await flushDefs(defs);
		await flushPrints(prints);
		await flushFaces(facePrintIds, faces);
		defs = [];
		prints = [];
		faces = [];
		facePrintIds = [];
	}

	for await (const line of rl) {
		const card = parseLine(line);
		if (!card) continue;
		seen++;
		const rows = toCatalogRows(card);
		if (!rows) continue;
		kept++;
		defs.push(rows.definition);
		prints.push(rows.print);
		facePrintIds.push(rows.print.id);
		faces.push(...rows.faces);

		if (prints.length >= UPSERT_BATCH) await flushAll();
		if (seen % 50_000 === 0) console.log(`ℹ pass1: ${seen} lues, ${kept} gardées…`);
		if (limit > 0 && kept >= limit) break;
	}
	await flushAll();
	console.log(`✓ ${dryRun ? '[dry-run] ' : ''}pass1: ${kept}/${seen} cartes gardées`);
}

async function main() {
	const started = Date.now();
	await pass1();
	// pass2 added in the next task
	console.log(`✓ done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
	console.error('✖ seed-catalog failed:', err);
	process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json` scripts, after `seed:localized-cards`, add:

```json
"seed:catalog": "NODE_ENV=production npx tsx scripts/seed/seed-catalog.ts",
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW error.

- [ ] **Step 4: Dry-run (no DB write) to validate normalization + streaming**

Run: `npm run seed:catalog -- --dry-run --limit=2000`
Expected: prints `pass1: <kept>/<seen> cartes gardées` with kept > 0; no memory blow-up; process exits 0.

- [ ] **Step 5: Real limited seed against local DB, then spot-check**

Ensure `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are set to local (see `npm run sb:status`).
Run: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local key> npm run seed:catalog -- --limit=3000`
Then in Studio/psql confirm: rows exist in `card_definitions`, `card_prints` (both `lang='en'` and `lang='fr'` present), `card_faces` (a DFC print has 2 rows). Spot-check `dsk/1`: EN and FR prints share `oracle_id`, FR has `printed_name`.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed/seed-catalog.ts package.json
git commit -m "$(printf 'feat(seed): catalog seeder pass 1 (definitions/prints/faces)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: Seeder pass 2 — resolve `all_parts` into `card_parts`

**Files:**

- Modify: `scripts/seed/seed-catalog.ts` (add `pass2`, call it from `main`)

**Interfaces:**

- Consumes: `card_prints` populated by pass 1 (the DB is the `print_id → oracle_id` map).
- Produces: `card_parts` populated with oracle→oracle edges.

`all_parts` entries expose the part's **print id**, not its oracle id. Pass 2 re-streams the bulk, and for each kept card resolves every `all_parts[].id` (a print id) to its `oracle_id` by querying `card_prints`, then upserts the edge. Edges whose cited print is absent from `card_prints` are skipped. The mapping lives in the DB, queried in batches — never a ~90k in-memory map.

- [ ] **Step 1: Add the print→oracle resolver and pass 2**

```ts
interface PartEdge {
	oracle_id: string;
	related_print_id: string;
	component: string;
	name: string | null;
	type_line: string | null;
}

interface CardPartRow {
	oracle_id: string;
	related_oracle_id: string;
	component: string;
	name: string | null;
	type_line: string | null;
}

// Resolve a batch of related print ids to their oracle ids via the DB (populated
// by pass 1). Returns a Map(print_id -> oracle_id) for the ids that exist.
async function resolveOracleIds(printIds: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (dryRun || printIds.length === 0) return out;
	const unique = [...new Set(printIds)];
	for (let i = 0; i < unique.length; i += 500) {
		const chunk = unique.slice(i, i + 500);
		const { data, error } = await sb().from('card_prints').select('id, oracle_id').in('id', chunk);
		if (error) throw new Error(`card_prints resolve failed: ${error.message}`);
		for (const r of data as Array<{ id: string; oracle_id: string }>) out.set(r.id, r.oracle_id);
	}
	return out;
}

async function flushParts(rows: CardPartRow[]) {
	if (rows.length === 0 || dryRun) return;
	const { error } = await sb()
		.from('card_parts')
		.upsert(rows, { onConflict: 'oracle_id,related_oracle_id,component' });
	if (error) throw new Error(`card_parts upsert failed: ${error.message}`);
}

async function pass2(): Promise<void> {
	const url = await bulkUrl('default_cards');
	const rl = await openBulkLines(url);

	let seen = 0;
	let edges: PartEdge[] = [];

	async function flushEdgeBatch() {
		if (edges.length === 0) return;
		const map = await resolveOracleIds(edges.map((e) => e.related_print_id));
		const rows: CardPartRow[] = [];
		for (const e of edges) {
			const related = map.get(e.related_print_id);
			if (!related) continue; // cited print not in catalog — skip
			rows.push({
				oracle_id: e.oracle_id,
				related_oracle_id: related,
				component: e.component,
				name: e.name,
				type_line: e.type_line,
			});
		}
		await flushParts(rows);
		edges = [];
	}

	for await (const line of rl) {
		const card = parseLine(line);
		if (!card) continue;
		seen++;
		// Only cards we kept in pass 1 contribute edges (same filter).
		const rowsFromCard = toCatalogRows(card);
		if (!rowsFromCard || !card.all_parts?.length) continue;
		for (const p of card.all_parts) {
			edges.push({
				oracle_id: card.oracle_id,
				related_print_id: p.id,
				component: p.component,
				name: p.name ?? null,
				type_line: p.type_line ?? null,
			});
		}
		if (edges.length >= UPSERT_BATCH) await flushEdgeBatch();
		if (seen % 50_000 === 0) console.log(`ℹ pass2: ${seen} lues…`);
		if (limit > 0 && seen >= limit * 5) break; // parts are sparse; scan a bit wider under --limit
	}
	await flushEdgeBatch();
	console.log(`✓ ${dryRun ? '[dry-run] ' : ''}pass2: edges resolved`);
}
```

- [ ] **Step 2: Call pass 2 from `main`**

In `main`, replace the `// pass2 added in the next task` comment with:

```ts
await pass2();
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW error.

- [ ] **Step 4: Run full-ish seed against local DB and spot-check parts**

Run: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local key> npm run seed:catalog -- --limit=5000`
Then confirm in Studio/psql: `card_parts` has rows; find Krenko's oracle and confirm an edge with `component='token'` whose `related_oracle_id` matches the Goblin token's oracle (both must have been within the scanned window — if not, run without `--limit` for a full seed).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/seed-catalog.ts
git commit -m "$(printf 'feat(seed): catalog pass 2 resolves all_parts to oracle->oracle edges\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: Full local seed (verification run)

**Files:** none (operational task).

**Interfaces:**

- Consumes: Tasks 4-7.
- Produces: a fully populated local catalog for manual verification.

- [ ] **Step 1: Reset DB and run the full seed**

Run: `npm run sb:reset`
Then: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local key> npm run seed:catalog`
Expected: pass1 then pass2 complete without error (this streams ~90k rows; expect several minutes).

- [ ] **Step 2: Sanity-check row counts and known cards**

In psql/Studio:

- `select count(*) from card_definitions;` — order ~30-40k.
- `select lang, count(*) from card_prints group by lang;` — both `en` and `fr` present.
- `select count(*) from card_faces;` and `select count(*) from card_parts;` — both > 0.
- `dsk/1`: `select id, lang, oracle_id, printed_name from card_prints where set='dsk' and collector_number='1';` — 2 rows (en/fr), same oracle_id, fr has printed_name.
- A transform DFC (e.g. `select * from card_faces where print_id = (select id from card_prints where set='dsk' and lang='en' and collector_number='<a DFC number>');`) — 2 face rows, each with image_uris.

- [ ] **Step 3: No commit** (operational verification only).

---

## Task 9: Retire `localized_cards`

**Files:**

- Create: `supabase/migrations/20260723120002_drop_localized_cards.sql`
- Delete: `src/lib/scryfall/db/localized-cards.ts`, `src/lib/supabase/queries/localized-cards.ts`, `scripts/seed/seed-localized-cards.ts`, `scripts/seed/normalize-localized-card.ts`
- Modify: the prefetch consumer that imported `prefetchLocalizedCards` (find in Step 2)
- Modify: `package.json` (remove `seed:localized-cards` script)

**Interfaces:**

- Consumes: the catalog tables (which now hold FR prints + faces — the data `localized_cards` used to serve).
- Produces: no remaining reference to `localized_cards` or its TS modules.

> **Sequencing note:** The client read-path (useLocalizedImage / prefetch) currently fetches localized images from `localized_cards` and Scryfall. Fully repointing that path to `card_prints` is **sub-project 1** (read-from-DB), not this task. Here we only remove the now-redundant `localized_cards` seed/table and the dead prefetch wiring, leaving `useLocalizedImage`'s Scryfall-API fallback intact (the app still localizes images via the API until sub-project 1 lands). If removing the prefetch import would break the API fallback, STOP and leave `localized_cards` table + query in place, dropping only the seed script — record this deviation for sub-project 1.

- [ ] **Step 1: Write the drop migration**

```sql
-- localized_cards is absorbed by card_prints (lang='fr') + card_faces. Drop it.
drop table if exists public.localized_cards;
```

- [ ] **Step 2: Find and assess the prefetch consumer**

Run: `grep -rn "prefetchLocalizedCards\|scryfall/db/localized-cards\|queries/localized-cards" src/ | grep -v node_modules`
Read each hit. If the only consumers are the prefetch wiring (SearchPanelCore / collection / deck views calling `prefetchLocalizedCards`), remove those calls — the `useLocalizedImage` API fallback still works without prefetch (it just loses the warm-cache optimization until sub-project 1). If any consumer needs the data structurally, follow the STOP guidance in the sequencing note.

- [ ] **Step 3: Delete the dead modules and prefetch calls**

Delete the four files listed under Files. Remove the `prefetchLocalizedCards(...)` call sites found in Step 2 (and their imports).

- [ ] **Step 4: Remove the npm script**

In `package.json`, delete the `"seed:localized-cards": …` line.

- [ ] **Step 5: Verify nothing references the removed symbols**

Run: `grep -rn "localized_cards\|prefetchLocalizedCards\|seed-localized" src/ scripts/ package.json | grep -v node_modules`
Expected: no output.
Run: `npm run sb:reset` — applies the drop cleanly.
Run: `npx tsc --noEmit` — no NEW error from the deletions.

- [ ] **Step 6: Runtime check**

Run: `npm run dev`; open a deck/collection in FR. Cards still display (localized image via the surviving API fallback in `useLocalizedImage`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'refactor: retire localized_cards (absorbed by card_prints/faces)\n\nDrops the table and its seed/query modules and the dead prefetch wiring.\nThe useLocalizedImage Scryfall-API fallback stays until sub-project 1\nrepoints the read path to card_prints.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10: Final full-project check

**Files:** none.

- [ ] **Step 1: Run the full project check**

Run: `npm run check`
Expected: no NEW problems beyond the ~60 pre-existing baseline. Compare the count/files to baseline; any new problem must trace to a file this plan touched and be fixed.

- [ ] **Step 2: Confirm the migration timeline applies from scratch**

Run: `npm run sb:reset`
Expected: all migrations (rename, catalog, drop localized) apply with no error on a virgin DB.

- [ ] **Step 3: No commit** (verification only). Sub-project 0 complete.

---

## Self-Review

**Spec coverage:**

- Rename `cards → card_entries` (migration + call sites + fns/policies) → Tasks 1-2. ✔
- Four catalog tables with the exact columns/PKs/FKs/indexes from the spec → Task 4. ✔
- EN+FR at print level, gameplay in card_definitions → Tasks 4-5 (lang check, split of fields). ✔
- `card_faces` per-face printed_* (fixes split/adventure null bug) → Task 5 (faces from card.card_faces). ✔
- `card_parts` oracle→oracle, no strict FK on related_oracle_id, two-pass resolution → Tasks 4, 7. ✔
- Seed from default_cards, filter lang∈{en,fr} + games⊇paper, images {small,normal,large}, streaming, batched → Tasks 5-8. ✔
- Tokens seeded as full cards (not sub-objects) → Task 5 (no token special-casing; they pass the normal filter). ✔
- `localized_cards` absorbed/retired → Task 9. ✔
- `reversible_card` added to ScryfallLayout → Task 3. ✔
- Out of scope (DB-read/SSR, freshness, prices, flavor_*, card_entries→card_prints FK) → not implemented, correct. ✔

**Placeholder scan:** No TBD/TODO/"handle edge cases". The only deliberate "read the live definition" instruction is Task 1's quota-function/policy recreation, which cannot be inlined verbatim without copying large existing SQL out of context — the note names the exact source files, lines, and the mechanical transform (`public.cards` → `public.card_entries`). This is a guided copy, not a placeholder.

**Type consistency:** `toCatalogRows` return shape (`{definition, print, faces}`) is consumed identically in Tasks 6-7. `CardDefinitionRow`/`CardPrintRow`/`CardFaceRow`/`CardPartRow` names match between normalize module and seeder. `pick3`/`Img3` used consistently. Table names (`card_entries`, `card_definitions`, `card_prints`, `card_faces`, `card_parts`) consistent across SQL and TS.
