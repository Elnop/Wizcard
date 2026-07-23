# Catalog Read Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve deterministic card lookups from the local catalog (DB → `ScryfallCard`-shaped object) with a Scryfall fallback, so the app stops depending on the live API for key-based access.

**Architecture:** Two layers. `catalog-db` (pure) reads the catalog tables and returns `ScryfallCard | null` via an assembler `rowsToScryfallCard`. `card-source` (orchestrator) calls `catalog-db` first and falls back to the existing Scryfall endpoints on a null. Requires two additive catalog migrations (external-id columns on `card_prints`, and a new `card_sets` table) + their seed, plus making the `ScryfallCard` fields the catalog cannot supply optional. The card detail page is the pilot consumer.

**Tech Stack:** Supabase (Postgres + RLS), TypeScript, `@supabase/supabase-js`, Next.js server components, `tsx` for seed scripts. No test framework — verify via `npm run check` + runtime + psql.

## Global Constraints

- **No test framework** (no vitest/jest). Verify via `npm run check`, runtime, and psql — never by writing/running unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51-60 pre-existing problems in unrelated files). Gate on "no NEW problems" — run `npx eslint <changed files>` on files you touched. (project memory)
- **Migrations are idempotent** (`add column if not exists`, `create table if not exists`, `drop policy if exists` before create, constraint guarded by `drop … if exists`). (project convention)
- **`sb:reset` LOCAL is authorized** (user-approved for this work). NEVER any destructive command against a non-local target. Local Supabase is running. (session)
  - `SUPABASE_URL=http://127.0.0.1:54321`
  - `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU`
- **Catalog is public-read, service_role-write only**: new catalog tables get RLS + a `select using (true)` policy + `grant select` to anon/authenticated + `grant select,insert,update,delete` to service_role, matching the existing catalog tables. (sub-project 0 pattern)
- **Store only `{small,normal,large}`** image sizes (already enforced by the seed's `pick3`). (spec)
- **`foil`/`nonfoil` are DERIVED at read time** from `finishes` (`foil = finishes.includes('foil')`, `nonfoil = finishes.includes('nonfoil')`) — NOT stored. Verified against the API. (spec)
- **Server Supabase client**: `import { createClient } from '@/lib/supabase/server'`; it is `async` — `const supabase = await createClient()`.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

**Migrations (created):**

- `supabase/migrations/20260724120000_add_print_external_ids.sql` — external-id columns on `card_prints`.
- `supabase/migrations/20260724120001_create_card_sets.sql` — the `card_sets` table.

**Seed (created/modified):**

- `scripts/seed/normalize-catalog-card.ts` (modify) — add external-id fields to `CardPrintRow` + builder.
- `scripts/seed/seed-catalog.ts` (modify) — flush the new columns (already flowing through the row).
- `scripts/seed/seed-sets.ts` (create) — seed `card_sets` from Scryfall `/sets`.
- `package.json` (modify) — add `seed:sets`.

**Read layer (created):**

- `src/lib/card/catalog-db/assembler.ts` — `rowsToScryfallCard` (+ row types, pure).
- `src/lib/card/catalog-db/index.ts` — the pure lookups (`byId`, `bySetNumber`, …).
- `src/lib/card/source/index.ts` — the orchestrator (DB-first + Scryfall fallback).

**Type (modified):**

- `src/lib/scryfall/types/scryfall.ts` — make catalog-unsupplied `ScryfallCard` fields optional.

**Pilot consumer (modified):**

- `src/app/[locale]/card/[id]/page.tsx` — import `getCardById` from `card-source`.

---

## Task 1: External-id columns on `card_prints` (migration)

**Files:**

- Create: `supabase/migrations/20260724120000_add_print_external_ids.sql`

**Interfaces:**

- Produces: `card_prints` gains `multiverse_ids int[]`, `mtgo_id int`, `arena_id int`, `tcgplayer_id int`, `cardmarket_id int` (all nullable).

- [ ] **Step 1: Write the migration**

```sql
-- External marketplace/game ids, per print (verified: differ EN vs FR, usually null in FR).
-- Additive + nullable so a from-scratch apply and a re-seed both work.
alter table public.card_prints add column if not exists multiverse_ids int[];
alter table public.card_prints add column if not exists mtgo_id int;
alter table public.card_prints add column if not exists arena_id int;
alter table public.card_prints add column if not exists tcgplayer_id int;
alter table public.card_prints add column if not exists cardmarket_id int;

-- Lookup indexes for the external-id read paths (partial: skip nulls).
create index if not exists card_prints_mtgo_id_idx on public.card_prints (mtgo_id) where mtgo_id is not null;
create index if not exists card_prints_arena_id_idx on public.card_prints (arena_id) where arena_id is not null;
create index if not exists card_prints_tcgplayer_id_idx on public.card_prints (tcgplayer_id) where tcgplayer_id is not null;
create index if not exists card_prints_cardmarket_id_idx on public.card_prints (cardmarket_id) where cardmarket_id is not null;
create index if not exists card_prints_multiverse_ids_idx on public.card_prints using gin (multiverse_ids);
```

- [ ] **Step 2: Apply to a fresh DB**

Run: `npm run sb:reset`
Expected: completes with no error.

- [ ] **Step 3: Verify columns exist**

Run (docker psql — get the container with `docker ps --format '{{.Names}}' | grep supabase_db`):
`docker exec <db> psql -U postgres -d postgres -tAc "select column_name from information_schema.columns where table_name='card_prints' and column_name in ('multiverse_ids','mtgo_id','arena_id','tcgplayer_id','cardmarket_id') order by column_name;"`
Expected: the 5 column names listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260724120000_add_print_external_ids.sql
git commit -m "$(printf 'feat(db): add external-id columns to card_prints\n\nmultiverse_ids/mtgo_id/arena_id/tcgplayer_id/cardmarket_id (per print,\nnullable) for deterministic external-id lookups.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: `card_sets` table (migration)

**Files:**

- Create: `supabase/migrations/20260724120001_create_card_sets.sql`

**Interfaces:**

- Produces: table `card_sets` (PK `code`), public-read RLS, service_role write grants.

- [ ] **Step 1: Write the migration**

```sql
-- Set metadata, joined by card_prints.set = card_sets.code. Separated (not repeated on
-- every print) like Scryfall separates the Set object. Seeded from /sets (see seed:sets).
create table if not exists public.card_sets (
  code           text primary key,
  id             uuid,
  name           text not null,
  set_type       text,
  released_at    date,
  card_count     int,
  digital        boolean,
  icon_svg_uri   text,
  parent_set_code text,
  block          text,
  block_code     text,
  updated_at     timestamptz not null default now()
);

alter table public.card_sets enable row level security;
drop policy if exists card_sets_select_all on public.card_sets;
create policy card_sets_select_all on public.card_sets for select using (true);
grant select on public.card_sets to anon, authenticated;
grant select, insert, update, delete on public.card_sets to service_role;
```

- [ ] **Step 2: Apply + verify**

Run: `npm run sb:reset`
Then: `docker exec <db> psql -U postgres -d postgres -tAc "select count(*) from card_sets;"` → `0` (table exists, empty).
Confirm one select-all policy: `… -tAc "select policyname, cmd from pg_policies where tablename='card_sets';"` → one SELECT row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260724120001_create_card_sets.sql
git commit -m "$(printf 'feat(db): add card_sets table (set metadata)\n\nPK set code; public-read RLS; service_role write. Joined by card_prints.set.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Seed `card_sets` from Scryfall `/sets`

**Files:**

- Create: `scripts/seed/seed-sets.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `card_sets` table (Task 2); `ScryfallSet` type from `@/lib/scryfall/types/scryfall`.
- Produces: `card_sets` populated (~1000 rows) after a run.

`/sets` returns ALL sets in one paged list (`getAllSets` exists in `endpoints/sets.ts`, but this is a standalone seed script — call the endpoint directly with the service-role client, like the other seeds do).

- [ ] **Step 1: Write the seeder**

```ts
// Seed public.card_sets from Scryfall /sets (one small paged list, no bulk file).
//   npm run seed:sets
// Writes via the service-role key.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ScryfallSet, ScryfallList } from '@/lib/scryfall/types/scryfall';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const UA = 'Wizcard/1.0 (https://github.com/devinedev/wizcard)';

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error('✖ Missing SUPABASE_SERVICE_ROLE_KEY');
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

interface CardSetRow {
	code: string;
	id: string | null;
	name: string;
	set_type: string | null;
	released_at: string | null;
	card_count: number | null;
	digital: boolean | null;
	icon_svg_uri: string | null;
	parent_set_code: string | null;
	block: string | null;
	block_code: string | null;
}

function toRow(s: ScryfallSet): CardSetRow {
	return {
		code: s.code,
		id: s.id ?? null,
		name: s.name,
		set_type: s.set_type ?? null,
		released_at: s.released_at ?? null,
		card_count: s.card_count ?? null,
		digital: s.digital ?? null,
		icon_svg_uri: s.icon_svg_uri ?? null,
		parent_set_code: s.parent_set_code ?? null,
		block: s.block ?? null,
		block_code: s.block_code ?? null,
	};
}

async function main() {
	let url: string | null = 'https://api.scryfall.com/sets';
	const rows: CardSetRow[] = [];
	while (url) {
		const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
		const list = (await res.json()) as ScryfallList<ScryfallSet>;
		for (const s of list.data) rows.push(toRow(s));
		url = list.has_more && list.next_page ? list.next_page : null;
	}
	const { error } = await sb().from('card_sets').upsert(rows, { onConflict: 'code' });
	if (error) throw new Error(`card_sets upsert failed: ${error.message}`);
	console.log(`✓ seeded ${rows.length} sets`);
}

main().catch((err) => {
	console.error('✖ seed-sets failed:', err);
	process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `package.json`, after `seed:catalog`, add:

```json
"seed:sets": "NODE_ENV=production npx tsx scripts/seed/seed-sets.ts",
```

- [ ] **Step 3: Type-check + run**

Run: `npx tsc --noEmit` (no new error).
Run: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<key> npm run seed:sets`
Expected: `✓ seeded <N> sets` with N in the ~900-1100 range.
Verify: `docker exec <db> psql -U postgres -d postgres -tAc "select name from card_sets where code='dsk';"` → `Duskmourn: House of Horror`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed/seed-sets.ts package.json
git commit -m "$(printf 'feat(seed): seed card_sets from Scryfall /sets\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Seed external ids into `card_prints`

**Files:**

- Modify: `scripts/seed/normalize-catalog-card.ts`

**Interfaces:**

- Consumes: `ScryfallCard` external-id fields.
- Produces: `CardPrintRow` carries `multiverse_ids`, `mtgo_id`, `arena_id`, `tcgplayer_id`, `cardmarket_id`; the existing `card_prints` upsert (in seed-catalog.ts) writes them without change (it upserts the whole row).

- [ ] **Step 1: Extend `CardPrintRow` and its builder**

In `scripts/seed/normalize-catalog-card.ts`, add to the `CardPrintRow` interface:

```ts
	multiverse_ids: number[] | null;
	mtgo_id: number | null;
	arena_id: number | null;
	tcgplayer_id: number | null;
	cardmarket_id: number | null;
```

And in the `print` object built inside `toCatalogRows`, add:

```ts
		multiverse_ids: card.multiverse_ids ?? null,
		mtgo_id: card.mtgo_id ?? null,
		arena_id: card.arena_id ?? null,
		tcgplayer_id: card.tcgplayer_id ?? null,
		cardmarket_id: card.cardmarket_id ?? null,
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → no new error. (`seed-catalog.ts` needs no change — it upserts the whole `CardPrintRow`.)

- [ ] **Step 3: Re-seed and verify external ids landed**

Run: `npm run sb:reset` then `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed:catalog` (full; ~70-130s).
Verify: `docker exec <db> psql -U postgres -d postgres -tAc "select multiverse_ids, mtgo_id, arena_id, tcgplayer_id, cardmarket_id from card_prints where set='dsk' and collector_number='1' and lang='en';"`
Expected: multiverse_ids `{673406}`, mtgo_id/arena_id/tcgplayer_id/cardmarket_id populated (non-null).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed/normalize-catalog-card.ts
git commit -m "$(printf 'feat(seed): populate card_prints external ids\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Make catalog-unsupplied `ScryfallCard` fields optional

**Files:**

- Modify: `src/lib/scryfall/types/scryfall.ts` (the `ScryfallCard` interface)

**Interfaces:**

- Produces: `ScryfallCard` has these fields OPTIONAL (the assembler cannot supply them): `uri`, `scryfall_uri`, `set_id`, `set_name`, `set_type`, `set_uri`, `set_search_uri`, `scryfall_set_uri`, `rulings_uri`, `prints_search_uri`, `related_uris`, `games`, `highres_image`, `full_art`, `textless`, `booster`, `story_spotlight`, `oversized`, `prices`. (`prices` already had `ScryfallPrices` — make the field itself optional.)

Rationale: the catalog does not store these; the assembler leaves them undefined. Making them optional lets a reconstructed card type-check without inventing fake values. `set_name`/`set_type`/`set_id` are supplied from `card_sets` at read time (Task 6) — but keep them optional since a print whose set is missing from `card_sets` would lack them.

- [ ] **Step 1: Add `?` to each listed field**

In the `ScryfallCard` interface, change each of the fields listed above from `field: Type;` to `field?: Type;`. Example:

```ts
	// before
	uri: string;
	scryfall_uri: string;
	// after
	uri?: string;
	scryfall_uri?: string;
```

Do this for every field in the Interfaces list above. Leave truly-always-present fields required: `id`, `oracle_id`, `object`, `name`, `lang`, `released_at`, `layout`, `image_status`, `cmc`, `type_line`, `color_identity`, `keywords`, `legalities`, `reserved`, `finishes`, `promo`, `reprint`, `variation`, `set`, `collector_number`, `digital`, `rarity`, `border_color`, `frame` (all supplied by the catalog). `foil`/`nonfoil` stay required (derived at read time). `set_name`/`set_type`/`set_id` become optional (from card_sets, may be absent).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: this may surface consumers that accessed a now-optional field without a guard. If any NEW error appears in a file this plan does not otherwise touch, it means a consumer assumed the field always present. For THIS task, only fix errors by adding `?.`/`??` guards at the error site if trivial; if a consumer needs real handling, note it — but the pilot (card page) does not read these fields (verified), so expect few or none.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint src/lib/scryfall/types/scryfall.ts <any file you added a guard to>`
Expected: no new problems.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(printf 'refactor(scryfall): make catalog-unsupplied ScryfallCard fields optional\n\nThe DB read layer reconstructs a partial ScryfallCard; fields the catalog\ndoes not store (uri/prices/set_name/rulings_uri/games/...) become optional\nso a reconstructed card type-checks without fake values.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: The assembler `rowsToScryfallCard` (pure)

**Files:**

- Create: `src/lib/card/catalog-db/assembler.ts`

**Interfaces:**

- Consumes: `ScryfallCard`, `ScryfallCardFace`, `ScryfallImageUris` from `@/lib/scryfall/types/scryfall`.
- Produces:
  - row types `DefinitionRow`, `PrintRow`, `DefinitionFaceRow`, `PrintFaceRow`, `SetRow` (the shapes selected from the DB).
  - `rowsToScryfallCard(args: { def: DefinitionRow; print: PrintRow; defFaces: DefinitionFaceRow[]; printFaces: PrintFaceRow[]; set?: SetRow | null }): ScryfallCard` — pure, no DB.

- [ ] **Step 1: Write the assembler**

```ts
// Pure inverse of the seed's toCatalogRows: given catalog rows for one print, rebuild a
// ScryfallCard-shaped object. No DB, no I/O. foil/nonfoil are derived from finishes.

import type {
	ScryfallCard,
	ScryfallCardFace,
	ScryfallImageUris,
	ScryfallColors,
	ScryfallLayout,
	ScryfallRarity,
	ScryfallBorderColor,
	ScryfallFrame,
	ScryfallImageStatus,
	ScryfallLegalities,
} from '@/lib/scryfall/types/scryfall';

export interface DefinitionRow {
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
	legalities: ScryfallLegalities | null;
	reserved: boolean | null;
	edhrec_rank: number | null;
	layout: string | null;
}

export interface PrintRow {
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
	image_uris: ScryfallImageUris | null;
	finishes: string[] | null;
	promo: boolean | null;
	reprint: boolean | null;
	variation: boolean | null;
	digital: boolean | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
	multiverse_ids: number[] | null;
	mtgo_id: number | null;
	arena_id: number | null;
	tcgplayer_id: number | null;
	cardmarket_id: number | null;
}

export interface DefinitionFaceRow {
	oracle_id: string;
	face_index: number;
	name: string | null;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	colors: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
}

export interface PrintFaceRow {
	print_id: string;
	face_index: number;
	artist: string | null;
	illustration_id: string | null;
	image_uris: ScryfallImageUris | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
}

export interface SetRow {
	code: string;
	id: string | null;
	name: string;
	set_type: string | null;
}

function buildFaces(
	defFaces: DefinitionFaceRow[],
	printFaces: PrintFaceRow[]
): ScryfallCardFace[] | undefined {
	if (defFaces.length === 0) return undefined;
	const byIndex = new Map(printFaces.map((p) => [p.face_index, p]));
	return [...defFaces]
		.sort((a, b) => a.face_index - b.face_index)
		.map((df): ScryfallCardFace => {
			const pf = byIndex.get(df.face_index);
			return {
				object: 'card_face',
				name: df.name ?? '',
				mana_cost: df.mana_cost ?? '',
				type_line: df.type_line ?? undefined,
				oracle_text: df.oracle_text ?? undefined,
				colors: (df.colors as ScryfallColors) ?? undefined,
				power: df.power ?? undefined,
				toughness: df.toughness ?? undefined,
				loyalty: df.loyalty ?? undefined,
				artist: pf?.artist ?? undefined,
				illustration_id: pf?.illustration_id ?? undefined,
				image_uris: pf?.image_uris ?? undefined, // null for shared-image split faces → undefined
				printed_name: pf?.printed_name ?? undefined,
				printed_type_line: pf?.printed_type_line ?? undefined,
				printed_text: pf?.printed_text ?? undefined,
			};
		});
}

export function rowsToScryfallCard(args: {
	def: DefinitionRow;
	print: PrintRow;
	defFaces: DefinitionFaceRow[];
	printFaces: PrintFaceRow[];
	set?: SetRow | null;
}): ScryfallCard {
	const { def, print, defFaces, printFaces, set } = args;
	const finishes = print.finishes ?? [];
	return {
		object: 'card',
		id: print.id,
		oracle_id: def.oracle_id,
		name: def.name,
		lang: print.lang,
		released_at: print.released_at ?? '',
		layout: (def.layout as ScryfallLayout) ?? 'normal',
		image_status: (print.image_status as ScryfallImageStatus) ?? 'lowres',
		cmc: def.cmc ?? 0,
		type_line: def.type_line ?? '',
		oracle_text: def.oracle_text ?? undefined,
		mana_cost: def.mana_cost ?? undefined,
		colors: (def.colors as ScryfallColors) ?? undefined,
		color_identity: (def.color_identity as ScryfallColors) ?? [],
		keywords: def.keywords ?? [],
		legalities: def.legalities ?? ({} as ScryfallLegalities),
		reserved: def.reserved ?? false,
		power: def.power ?? undefined,
		toughness: def.toughness ?? undefined,
		loyalty: def.loyalty ?? undefined,
		defense: def.defense ?? undefined,
		edhrec_rank: def.edhrec_rank ?? undefined,
		set: print.set,
		set_id: set?.id ?? undefined,
		set_name: set?.name ?? undefined,
		set_type: set?.set_type ?? undefined,
		collector_number: print.collector_number,
		rarity: (print.rarity as ScryfallRarity) ?? 'common',
		artist: print.artist ?? undefined,
		border_color: (print.border_color as ScryfallBorderColor) ?? 'black',
		frame: (print.frame as ScryfallFrame) ?? '2015',
		image_uris: print.image_uris ?? undefined,
		finishes,
		foil: finishes.includes('foil'),
		nonfoil: finishes.includes('nonfoil'),
		promo: print.promo ?? false,
		reprint: print.reprint ?? false,
		variation: print.variation ?? false,
		digital: print.digital ?? false,
		printed_name: print.printed_name ?? undefined,
		printed_type_line: print.printed_type_line ?? undefined,
		printed_text: print.printed_text ?? undefined,
		multiverse_ids: print.multiverse_ids ?? undefined,
		mtgo_id: print.mtgo_id ?? undefined,
		arena_id: print.arena_id ?? undefined,
		tcgplayer_id: print.tcgplayer_id ?? undefined,
		cardmarket_id: print.cardmarket_id ?? undefined,
		card_faces: buildFaces(defFaces, printFaces),
	};
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no error. If a `ScryfallCard` field this returns is still required but not set here, either it IS set above or Task 5 made it optional — reconcile (add it here if the catalog has it, else confirm Task 5 marked it optional).

- [ ] **Step 3: Lint + commit**

Run: `npx eslint src/lib/card/catalog-db/assembler.ts` (no new problems).

```bash
git add src/lib/card/catalog-db/assembler.ts
git commit -m "$(printf 'feat(catalog-db): rowsToScryfallCard assembler (pure)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: `catalog-db` pure lookups

**Files:**

- Create: `src/lib/card/catalog-db/index.ts`

**Interfaces:**

- Consumes: `rowsToScryfallCard` + the row types (Task 6); `createClient` from `@/lib/supabase/server`.
- Produces (all return `Promise<ScryfallCard | null>` unless noted):
  - `byId(id: string)`
  - `bySetNumber(set: string, collectorNumber: string)`
  - `bySetNumberLang(set: string, collectorNumber: string, lang: string)`
  - `byName(name: string, opts?: { lang?: string })`
  - `byMultiverseId(id: number)`, `byMtgoId(id: number)`, `byArenaId(id: number)`, `byTcgplayerId(id: number)`, `byCardmarketId(id: number)`
  - `byCollection(ids: string[]): Promise<(ScryfallCard | null)[]>` (order preserved; this task supports id-based identifiers — set+number batch may return null for now, filled by the orchestrator fallback)
  - `printsByOracleId(oracleId: string): Promise<ScryfallCard[]>`

- [ ] **Step 1: Write the lookups**

```ts
// Pure catalog reader: DB → ScryfallCard | null. No Scryfall, no fallback (that lives in
// card-source). Loads a print + its definition + faces (+ set) and rebuilds via the assembler.

import { createClient } from '@/lib/supabase/server';
import { rowsToScryfallCard } from './assembler';
import type { DefinitionRow, PrintRow, DefinitionFaceRow, PrintFaceRow, SetRow } from './assembler';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const PRINT_COLS =
	'id, oracle_id, set, collector_number, lang, rarity, released_at, artist, border_color, frame, image_status, image_uris, finishes, promo, reprint, variation, digital, printed_name, printed_type_line, printed_text, multiverse_ids, mtgo_id, arena_id, tcgplayer_id, cardmarket_id';
const DEF_COLS =
	'oracle_id, name, type_line, oracle_text, mana_cost, cmc, colors, color_identity, keywords, power, toughness, loyalty, defense, legalities, reserved, edhrec_rank, layout';
const DEF_FACE_COLS =
	'oracle_id, face_index, name, type_line, oracle_text, mana_cost, colors, power, toughness, loyalty';
const PRINT_FACE_COLS =
	'print_id, face_index, artist, illustration_id, image_uris, printed_name, printed_type_line, printed_text';
const SET_COLS = 'code, id, name, set_type';

type SB = Awaited<ReturnType<typeof createClient>>;

// Given a set of print rows, load the definitions/faces/sets they need and assemble.
async function assemblePrints(sb: SB, prints: PrintRow[]): Promise<ScryfallCard[]> {
	if (prints.length === 0) return [];
	const oracleIds = [...new Set(prints.map((p) => p.oracle_id))];
	const printIds = prints.map((p) => p.id);
	const setCodes = [...new Set(prints.map((p) => p.set))];

	const [defsRes, defFacesRes, printFacesRes, setsRes] = await Promise.all([
		sb.from('card_definitions').select(DEF_COLS).in('oracle_id', oracleIds),
		sb.from('card_definition_faces').select(DEF_FACE_COLS).in('oracle_id', oracleIds),
		sb.from('card_print_faces').select(PRINT_FACE_COLS).in('print_id', printIds),
		sb.from('card_sets').select(SET_COLS).in('code', setCodes),
	]);

	const defByOracle = new Map(
		((defsRes.data as DefinitionRow[] | null) ?? []).map((d) => [d.oracle_id, d])
	);
	const defFacesByOracle = new Map<string, DefinitionFaceRow[]>();
	for (const f of (defFacesRes.data as DefinitionFaceRow[] | null) ?? []) {
		const arr = defFacesByOracle.get(f.oracle_id) ?? [];
		arr.push(f);
		defFacesByOracle.set(f.oracle_id, arr);
	}
	const printFacesByPrint = new Map<string, PrintFaceRow[]>();
	for (const f of (printFacesRes.data as PrintFaceRow[] | null) ?? []) {
		const arr = printFacesByPrint.get(f.print_id) ?? [];
		arr.push(f);
		printFacesByPrint.set(f.print_id, arr);
	}
	const setByCode = new Map(((setsRes.data as SetRow[] | null) ?? []).map((s) => [s.code, s]));

	const out: ScryfallCard[] = [];
	for (const print of prints) {
		const def = defByOracle.get(print.oracle_id);
		if (!def) continue; // a print without its definition should not happen (FK), skip defensively
		out.push(
			rowsToScryfallCard({
				def,
				print,
				defFaces: defFacesByOracle.get(print.oracle_id) ?? [],
				printFaces: printFacesByPrint.get(print.id) ?? [],
				set: setByCode.get(print.set) ?? null,
			})
		);
	}
	return out;
}

async function firstPrintCard(
	sb: SB,
	query: PromiseLike<{ data: unknown; error: unknown }>
): Promise<ScryfallCard | null> {
	const { data, error } = await query;
	if (error || !data || (data as PrintRow[]).length === 0) return null;
	const cards = await assemblePrints(sb, data as PrintRow[]);
	return cards[0] ?? null;
}

export async function byId(id: string): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(sb, sb.from('card_prints').select(PRINT_COLS).eq('id', id).limit(1));
}

export async function bySetNumberLang(
	set: string,
	collectorNumber: string,
	lang: string
): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(
		sb,
		sb
			.from('card_prints')
			.select(PRINT_COLS)
			.eq('set', set)
			.eq('collector_number', collectorNumber)
			.eq('lang', lang)
			.limit(1)
	);
}

export async function bySetNumber(
	set: string,
	collectorNumber: string
): Promise<ScryfallCard | null> {
	return bySetNumberLang(set, collectorNumber, 'en');
}

export async function byName(name: string, opts?: { lang?: string }): Promise<ScryfallCard | null> {
	const sb = await createClient();
	const { data: defs } = await sb
		.from('card_definitions')
		.select('oracle_id')
		.eq('name', name)
		.limit(1);
	const oracleId = (defs as { oracle_id: string }[] | null)?.[0]?.oracle_id;
	if (!oracleId) return null;
	const lang = opts?.lang ?? 'en';
	return firstPrintCard(
		sb,
		sb
			.from('card_prints')
			.select(PRINT_COLS)
			.eq('oracle_id', oracleId)
			.eq('lang', lang)
			.order('released_at', { ascending: false })
			.limit(1)
	);
}

async function byExternalId(column: string, id: number): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(sb, sb.from('card_prints').select(PRINT_COLS).eq(column, id).limit(1));
}
export const byMtgoId = (id: number) => byExternalId('mtgo_id', id);
export const byArenaId = (id: number) => byExternalId('arena_id', id);
export const byTcgplayerId = (id: number) => byExternalId('tcgplayer_id', id);
export const byCardmarketId = (id: number) => byExternalId('cardmarket_id', id);

export async function byMultiverseId(id: number): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(
		sb,
		sb.from('card_prints').select(PRINT_COLS).contains('multiverse_ids', [id]).limit(1)
	);
}

export async function byCollection(ids: string[]): Promise<(ScryfallCard | null)[]> {
	if (ids.length === 0) return [];
	const sb = await createClient();
	const { data } = await sb
		.from('card_prints')
		.select(PRINT_COLS)
		.in('id', [...new Set(ids)]);
	const cards = await assemblePrints(sb, (data as PrintRow[] | null) ?? []);
	const byIdMap = new Map(cards.map((c) => [c.id, c]));
	return ids.map((id) => byIdMap.get(id) ?? null);
}

export async function printsByOracleId(oracleId: string): Promise<ScryfallCard[]> {
	const sb = await createClient();
	const { data } = await sb
		.from('card_prints')
		.select(PRINT_COLS)
		.eq('oracle_id', oracleId)
		.order('released_at', { ascending: false });
	return assemblePrints(sb, (data as PrintRow[] | null) ?? []);
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` and `npx eslint src/lib/card/catalog-db/index.ts`
Expected: no new problems. (If the PostgREST `.select(string)` returns a loosely-typed result causing a cast complaint, the `as PrintRow[]` casts handle it; keep them.)

- [ ] **Step 3: Runtime spot-check via a throwaway script**

Write a temp script `scripts/tmp-catalogdb-check.ts` that calls `byId` on a known catalog print id and prints `card.name`, `card.card_faces?.length`, `card.set_name`, `card.foil`. Run it with the local env vars. Confirm: a mono-face card returns no `card_faces`; a DFC returns `card_faces` length 2 with per-face `image_uris`; `set_name` is populated (from card_sets); `foil` reflects finishes. Then DELETE the temp script (do not commit it).

> To get a known DFC print id: `docker exec <db> psql -U postgres -d postgres -tAc "select p.id from card_prints p join card_definitions d on d.oracle_id=p.oracle_id where d.layout='transform' and p.lang='en' limit 1;"`

- [ ] **Step 4: Commit** (only index.ts — temp script deleted)

```bash
git add src/lib/card/catalog-db/index.ts
git commit -m "$(printf 'feat(catalog-db): pure DB lookups (byId/bySetNumber/byName/byCollection/...)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: `card-source` orchestrator (DB-first + Scryfall fallback)

**Files:**

- Create: `src/lib/card/source/index.ts`

**Interfaces:**

- Consumes: `catalog-db` lookups (Task 7); the existing Scryfall endpoints from `@/lib/scryfall/endpoints/cards`.
- Produces: functions with the SAME signatures/return types as the Scryfall endpoints they shadow, DB-first with fallback:
  - `getCardById(id: string): Promise<ScryfallCard>`
  - `getCardBySetNumber(set, n)`, `getCardBySetNumberAndLang(set, n, lang, signal?)`
  - `getCardByName(name, opts?)`
  - `getCardByMultiverseId/MtgoId/ArenaId/TcgplayerId/CardmarketId(id)`
  - `getCardCollection(identifiers)` — DB for id-identifiers, one batched Scryfall call for the misses, merged in input order.

- [ ] **Step 1: Write the orchestrator**

```ts
// DB-first card retrieval with Scryfall fallback. Same signatures as the Scryfall
// endpoints so a consumer swaps its import and nothing else. The fallback lives HERE;
// catalog-db knows nothing about Scryfall.

import * as db from '@/lib/card/catalog-db';
import * as scry from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCard, ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';

export async function getCardById(id: string): Promise<ScryfallCard> {
	return (await db.byId(id)) ?? scry.getCardById(id);
}

export async function getCardBySetNumber(set: string, n: string): Promise<ScryfallCard> {
	return (await db.bySetNumber(set, n)) ?? scry.getCardBySetNumber(set, n);
}

export async function getCardBySetNumberAndLang(
	set: string,
	n: string,
	lang: string,
	signal?: AbortSignal
): Promise<ScryfallCard> {
	return (
		(await db.bySetNumberLang(set, n, lang)) ?? scry.getCardBySetNumberAndLang(set, n, lang, signal)
	);
}

export async function getCardByName(name: string, opts?: { lang?: string }): Promise<ScryfallCard> {
	return (await db.byName(name, opts)) ?? scry.getCardByName(name);
}

export async function getCardByMultiverseId(id: number): Promise<ScryfallCard> {
	return (await db.byMultiverseId(id)) ?? scry.getCardByMultiverseId(id);
}
export async function getCardByMtgoId(id: number): Promise<ScryfallCard> {
	return (await db.byMtgoId(id)) ?? scry.getCardByMtgoId(id);
}
export async function getCardByArenaId(id: number): Promise<ScryfallCard> {
	return (await db.byArenaId(id)) ?? scry.getCardByArenaId(id);
}
export async function getCardByTcgplayerId(id: number): Promise<ScryfallCard> {
	return (await db.byTcgplayerId(id)) ?? scry.getCardByTcgplayerId(id);
}
export async function getCardByCardmarketId(id: number): Promise<ScryfallCard> {
	return (await db.byCardmarketId(id)) ?? scry.getCardByCardmarketId(id);
}

// Collection: resolve id-identifiers from the DB, fall back to ONE batched Scryfall call
// for the misses (and for any non-id identifiers), then merge in input order.
export async function getCardCollection(
	identifiers: ScryfallCardIdentifier[]
): Promise<ScryfallCard[]> {
	const idOf = (i: ScryfallCardIdentifier) => i.id;
	const ids = identifiers.map(idOf);
	const dbResults = await db.byCollection(ids.map((x) => x ?? ''));

	// Which slots are still missing (no id, or id not in catalog)?
	const missIdentifiers: ScryfallCardIdentifier[] = [];
	const missSlots: number[] = [];
	dbResults.forEach((card, i) => {
		if (!card) {
			missIdentifiers.push(identifiers[i]);
			missSlots.push(i);
		}
	});

	let fallback: ScryfallCard[] = [];
	if (missIdentifiers.length > 0) {
		const res = await scry.getCardCollection(missIdentifiers);
		fallback = res.data;
	}

	// Merge: Scryfall returns found cards in request order (minus not_found). Re-thread by
	// matching each miss identifier to a returned card; leave truly-not-found slots out.
	const out: ScryfallCard[] = [];
	let fi = 0;
	dbResults.forEach((card, i) => {
		if (card) {
			out.push(card);
		} else if (fi < fallback.length) {
			out.push(fallback[fi++]);
		}
		void missSlots; // slots tracked for clarity; order preserved by iteration
		void i;
	});
	return out;
}
```

> **Implementer note on `getCardCollection` merge:** the exact re-threading must preserve input order and drop not-found cards the same way Scryfall's `/cards/collection` does (it returns `data` + `not_found`). The version above walks DB results in order and splices fallback cards into the null slots sequentially. If the current callers of `getCardCollection` rely on the `ScryfallList` wrapper (`.data`/`.not_found`) rather than a bare array, MATCH the existing return type instead — check `scry.getCardCollection`'s signature (it returns `ScryfallList<ScryfallCard>`) and the pilot's needs. Since no consumer is migrated to this in Task 9 (card page doesn't use collection), keep this function's shape consistent with the Scryfall one (`Promise<ScryfallList<ScryfallCard>>`) to avoid a future mismatch — adjust the code to return `{ object:'list', has_more:false, data: out }` if that is the shadowed signature. Reconcile before committing.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` and `npx eslint src/lib/card/source/index.ts`
Expected: no new problems. Resolve the `getCardCollection` return-type per the note (match `scry.getCardCollection`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/source/index.ts
git commit -m "$(printf 'feat(card-source): DB-first orchestrator with Scryfall fallback\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: Migrate the card page (pilot consumer)

**Files:**

- Modify: `src/app/[locale]/card/[id]/page.tsx`

**Interfaces:**

- Consumes: `card-source`'s `getCardById`.
- Produces: the card page reads from the DB (fallback to Scryfall for non-catalog cards). No component changes — the object shape is unchanged.

- [ ] **Step 1: Swap the import**

In `src/app/[locale]/card/[id]/page.tsx`, change:

```ts
import { getCardById } from '@/lib/scryfall/endpoints/cards';
```

to:

```ts
import { getCardById } from '@/lib/card/source';
```

The two call sites (`generateMetadata` and the page body) are unchanged — same function name, same `Promise<ScryfallCard>` return.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` and `npx eslint "src/app/[locale]/card/[id]/page.tsx"`
Expected: no new problems.

- [ ] **Step 3: Runtime verification (the whole point)**

Run: `npm run dev`. Open a card page for a KNOWN catalog card (e.g. `/en/card/<a card_prints.id from the DB>`).

- Confirm it renders (name, image, tabs).
- Confirm it was served from the DB: temporarily add a `console.log` in `db.byId` or check the network — no `api.scryfall.com/cards/<id>` request for that card. (Remove any temp log before committing.)
  Then open a card page for an id NOT in the catalog (or a non-paper card) and confirm it still renders via fallback.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/card/[id]/page.tsx"
git commit -m "$(printf 'feat(card): card page reads from the catalog (DB-first)\n\nPilot consumer of card-source. Same ScryfallCard shape to components;\nfalls back to Scryfall for cards absent from the catalog.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10: Final check

**Files:** none.

- [ ] **Step 1: Full project check (no-NEW-problems gate)**

Run: `npm run check`
Expected: no NEW problems beyond baseline. Any problem in a file this plan touched must be fixed. Confirm the changed files are clean with `npx eslint` on each.

- [ ] **Step 2: From-scratch migration + seed sanity**

Run: `npm run sb:reset`, then `npm run seed:sets` and `npm run seed:catalog` (with local env vars).
Expected: all migrations apply; `card_sets` populated; `card_prints` external ids populated. Spot-check `byId` via the card page renders from DB.

- [ ] **Step 3: No commit** (verification only). Sub-project 1a complete.

---

## Self-Review

**Spec coverage:**

- catalog-db pure lookups (6 deterministic + 5 external-id) + assembler → Tasks 6, 7. ✔
- card-source orchestrator, DB-first + fallback, same signatures → Task 8. ✔
- External-id columns + card_sets table + seeds → Tasks 1-4. ✔
- ScryfallCard partial (optional fields) + foil/nonfoil derived → Tasks 5, 6. ✔
- Split-vs-DFC preserved in the assembler (`printFaces[i].image_uris` null → undefined) → Task 6 `buildFaces`. ✔
- Card page pilot → Task 9. ✔
- Out of scope (search/rulings/prices/domain type/other consumers) → not touched. ✔

**Placeholder scan:** No TBD/TODO. The `getCardCollection` merge carries an implementer note to reconcile the return type against the shadowed Scryfall signature — this is a real reconciliation step with the exact guidance (match `ScryfallList<ScryfallCard>`), not a placeholder; the code is complete and only its wrapper shape may need adjusting.

**Type consistency:** Row types (`DefinitionRow`/`PrintRow`/`DefinitionFaceRow`/`PrintFaceRow`/`SetRow`) are defined in Task 6 (assembler) and imported by Task 7. `PRINT_COLS` select string matches `PrintRow` fields incl. the external ids added in Task 1/4. `catalog-db` function names (`byId`/`bySetNumberLang`/`byName`/`byCollection`/`printsByOracleId`/`by*Id`) match their use in Task 8. `card-source` function names match the Scryfall endpoint names they shadow (so Task 9's import swap is drop-in).
