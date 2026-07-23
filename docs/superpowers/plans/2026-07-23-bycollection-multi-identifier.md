# Multi-identifier byCollection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `catalog-db.byCollection` to resolve heterogeneous card identifiers (`{id}`, `{set, collector_number}`, `{name}`, `{oracle_id}`, `{mtgo_id}`, `{multiverse_id}`) against the DB with an intra-DB English fallback, in a bounded number of queries — so `card-source` resolves set+number/name identifiers from the catalog instead of always missing to Scryfall.

**Architecture:** `byCollection` changes from `(ids: string[])` to `(identifiers: ScryfallCardIdentifier[], opts?: { lang? })`. It groups identifiers by form, issues one bounded query per form (id `.in`, set+number `or(and(...))` chunked, names `.in`/`.ilike`, external ids), applies per-form EN fallback, assembles via the existing `assemblePrints`, and re-threads into input order. `card-source.getCardCollection` passes structured identifiers through instead of `i.id ?? ''`.

**Tech Stack:** TypeScript, Supabase (`@supabase/supabase-js` via the Next server client), Next.js. No test framework — verify via `npm run check` + runtime + psql.

## Global Constraints

- **No test framework** — verify via tsc + eslint + a runtime spot-check (throwaway script under `scripts/`, deleted before commit) + psql. Never write unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51 pre-existing problems). Gate on NO NEW problems via `npx eslint <changed files>`. (project memory)
- **Bounded queries only** — NEVER a single unbounded `.or()` over the whole batch (PostgREST URI-length trap the old `localized_cards` reader hit). Chunk each form's group. (spec)
- **`catalog-db` stays PURE** — no Scryfall import, no fallback logic. The Scryfall fallback lives only in `card-source`. (1a invariant)
- **Order preservation**: `byCollection` returns results in input-identifier order, `null` for a genuinely-absent identifier. (spec)
- **Local Supabase running, DB seeded** (159k prints EN+FR, sets, external ids):
  - `SUPABASE_URL=http://127.0.0.1:54321`
  - `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU`
  - The `catalog-db` reader uses the Next server client (`@/lib/supabase/server`), which reads cookies — a plain `tsx` throwaway CANNOT use it. For runtime checks, mirror the query with `@supabase/supabase-js` directly (created inside a `scripts/*.ts` throwaway so module resolution works), OR rely on tsc + the consumer runtime checks in later specs.
- **Verified query shapes** (confirmed against the seeded DB, use these):
  - set+number group: `.or('and(set.eq.dsk,collector_number.eq.1),and(set.eq.blb,collector_number.eq.1)').in('lang', ['fr','en'])` → returns both langs for both cards.
  - FR name: `.ilike('printed_name', name).eq('lang','fr')`.
  - EN names batch: `card_definitions` `.in('name', [...])`.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- Modify: `src/lib/card/catalog-db/index.ts` — rewrite `byCollection`; add per-form resolver helpers. Reuse existing `assemblePrints`, `PRINT_COLS`, row types.
- Modify: `src/lib/card/source/index.ts` — `getCardCollection` passes structured identifiers to the new `byCollection`.

No new files; no migration; no seed change.

---

## Task 1: Extend `byCollection` to multi-identifier resolution

**Files:**

- Modify: `src/lib/card/catalog-db/index.ts`

**Interfaces:**

- Consumes: `assemblePrints(sb, prints)`, `PRINT_COLS`, `PrintRow`, `createClient` — all already in the file.
- Produces (replaces the old `byCollection`):

  ```ts
  export async function byCollection(
  	identifiers: ScryfallCardIdentifier[],
  	opts?: { lang?: string }
  ): Promise<(ScryfallCard | null)[]>;
  ```

  Order-preserving, `null` per unresolved slot. `ScryfallCardIdentifier` imported from `@/lib/scryfall/types/scryfall`.

- [ ] **Step 1: Write the resolver + new byCollection**

Replace the existing `byCollection` (currently the `ids: string[]` version) with the block below. It resolves each identifier form with a bounded query, prefers the requested language, falls back to EN intra-DB, and re-threads by input order. Add `import type { ScryfallCardIdentifier }` to the existing type import line.

```ts
const OR_CHUNK = 100; // bound each grouped query so the PostgREST URL stays under limits

// The target language for an identifier: its own lang, else the batch default, else 'en'.
function langFor(id: ScryfallCardIdentifier, batchLang?: string): string {
	return id.lang ?? batchLang ?? 'en';
}

// Pick the best print row for a wanted (set, collector_number, lang): the requested-lang
// row if present, else the English row (intra-DB fallback).
function pickByLang(rows: PrintRow[], lang: string): PrintRow | undefined {
	return rows.find((r) => r.lang === lang) ?? rows.find((r) => r.lang === 'en');
}

export async function byCollection(
	identifiers: ScryfallCardIdentifier[],
	opts?: { lang?: string }
): Promise<(ScryfallCard | null)[]> {
	if (identifiers.length === 0) return [];
	const sb = await createClient();

	// Collect the print rows needed, grouped by form, in bounded queries. We over-fetch each
	// group into `allPrints`, then resolve each identifier's slot against it in memory.
	const idVals: string[] = [];
	const setNumberVals: Array<{ set: string; collector_number: string }> = [];
	const enNames: string[] = [];
	const frNames: string[] = [];
	const oracleVals: string[] = [];
	const mtgoVals: number[] = [];
	const multiverseVals: number[] = [];

	for (const id of identifiers) {
		if (id.id) idVals.push(id.id);
		else if (id.set && id.collector_number)
			setNumberVals.push({ set: id.set, collector_number: id.collector_number });
		else if (id.name) {
			if (langFor(id, opts?.lang) !== 'en') frNames.push(id.name);
			enNames.push(id.name); // always also try EN by name (FR-then-EN best effort)
		} else if (id.oracle_id) oracleVals.push(id.oracle_id);
		else if (id.mtgo_id != null) mtgoVals.push(id.mtgo_id);
		else if (id.multiverse_id != null) multiverseVals.push(id.multiverse_id);
	}

	const prints: PrintRow[] = [];
	const pushRows = (rows: PrintRow[] | null) => {
		if (rows) prints.push(...rows);
	};

	// id group
	for (let i = 0; i < idVals.length; i += OR_CHUNK) {
		const chunk = [...new Set(idVals.slice(i, i + OR_CHUNK))];
		const { data } = await sb.from('card_prints').select(PRINT_COLS).in('id', chunk);
		pushRows(data as PrintRow[] | null);
	}
	// set+number group (fetch fr+en for each, pickByLang chooses)
	for (let i = 0; i < setNumberVals.length; i += OR_CHUNK) {
		const chunk = setNumberVals.slice(i, i + OR_CHUNK);
		const orExpr = chunk
			.map((c) => `and(set.eq.${c.set},collector_number.eq.${c.collector_number})`)
			.join(',');
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.or(orExpr)
			.in('lang', ['fr', 'en']);
		pushRows(data as PrintRow[] | null);
	}
	// oracle group
	for (let i = 0; i < oracleVals.length; i += OR_CHUNK) {
		const chunk = [...new Set(oracleVals.slice(i, i + OR_CHUNK))];
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.in('oracle_id', chunk)
			.in('lang', ['fr', 'en']);
		pushRows(data as PrintRow[] | null);
	}
	// external-id groups
	for (let i = 0; i < mtgoVals.length; i += OR_CHUNK) {
		const chunk = [...new Set(mtgoVals.slice(i, i + OR_CHUNK))];
		const { data } = await sb.from('card_prints').select(PRINT_COLS).in('mtgo_id', chunk);
		pushRows(data as PrintRow[] | null);
	}
	for (const mv of [...new Set(multiverseVals)]) {
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.contains('multiverse_ids', [mv]);
		pushRows(data as PrintRow[] | null);
	}
	// name groups: FR printed_name, then EN via definitions.name → its prints
	for (const name of [...new Set(frNames)]) {
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.ilike('printed_name', name)
			.eq('lang', 'fr');
		pushRows(data as PrintRow[] | null);
	}
	if (enNames.length > 0) {
		const uniqueEn = [...new Set(enNames)];
		for (let i = 0; i < uniqueEn.length; i += OR_CHUNK) {
			const chunk = uniqueEn.slice(i, i + OR_CHUNK);
			const { data: defs } = await sb
				.from('card_definitions')
				.select('oracle_id, name')
				.in('name', chunk);
			const oracleIds = [
				...new Set(((defs as { oracle_id: string }[] | null) ?? []).map((d) => d.oracle_id)),
			];
			for (let j = 0; j < oracleIds.length; j += OR_CHUNK) {
				const oc = oracleIds.slice(j, j + OR_CHUNK);
				const { data } = await sb
					.from('card_prints')
					.select(PRINT_COLS)
					.in('oracle_id', oc)
					.eq('lang', 'en');
				pushRows(data as PrintRow[] | null);
			}
		}
	}

	// Assemble every fetched print once, then index for slot resolution.
	const cards = await assemblePrints(sb, prints);
	const cardByPrintId = new Map(cards.map((c) => [c.id, c]));
	const printRowById = new Map(prints.map((p) => [p.id, p]));
	// index prints for lookup by form
	const printsBySetNumber = new Map<string, PrintRow[]>();
	for (const p of prints) {
		const key = `${p.set}/${p.collector_number}`;
		const arr = printsBySetNumber.get(key) ?? [];
		arr.push(p);
		printsBySetNumber.set(key, arr);
	}

	function resolveOne(id: ScryfallCardIdentifier): ScryfallCard | null {
		const lang = langFor(id, opts?.lang);
		if (id.id) return cardByPrintId.get(id.id) ?? null;
		if (id.set && id.collector_number) {
			const rows = printsBySetNumber.get(`${id.set}/${id.collector_number}`) ?? [];
			const row = pickByLang(rows, lang);
			return row ? (cardByPrintId.get(row.id) ?? null) : null;
		}
		if (id.name) {
			const target = id.name.toLowerCase();
			if (lang !== 'en') {
				const fr = prints.find(
					(p) => p.lang === 'fr' && (p.printed_name ?? '').toLowerCase() === target
				);
				if (fr) return cardByPrintId.get(fr.id) ?? null;
			}
			// EN by name: find a card whose (assembled) name matches
			const en = cards.find((c) => c.lang === 'en' && c.name.toLowerCase() === target);
			return en ?? null;
		}
		if (id.oracle_id) {
			const rows = prints.filter((p) => p.oracle_id === id.oracle_id);
			const row = pickByLang(rows, lang);
			return row ? (cardByPrintId.get(row.id) ?? null) : null;
		}
		if (id.mtgo_id != null) {
			const row = prints.find((p) => p.mtgo_id === id.mtgo_id);
			return row ? (cardByPrintId.get(row.id) ?? null) : null;
		}
		if (id.multiverse_id != null) {
			const row = prints.find((p) => (p.multiverse_ids ?? []).includes(id.multiverse_id!));
			return row ? (cardByPrintId.get(row.id) ?? null) : null;
		}
		return null;
	}

	void printRowById; // (kept only if needed; remove if unused after implementation)
	return identifiers.map(resolveOne);
}
```

> **Implementer note:** `PrintRow` must expose the fields `resolveOne` reads — `printed_name`, `lang`, `mtgo_id`, `multiverse_ids`, `oracle_id`, `set`, `collector_number`, `id`. Confirm they are in `PRINT_COLS` and the `PrintRow` type (they are, from 1a). Remove the `void printRowById;` line and the `printRowById` map if you don't end up needing it — it's scaffolding. Keep the code warning-clean (no unused vars).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` — this WILL surface the caller `card-source.getCardCollection` still calling `byCollection(identifiers.map((i) => i.id ?? ''))` with a `string[]` — that's Task 2. For THIS step, confirm the only new error is that call-site mismatch (everything inside `index.ts` type-checks). Run `npx eslint src/lib/card/catalog-db/index.ts` → clean (no unused vars — resolve the `printRowById` scaffolding).

- [ ] **Step 3: Runtime spot-check (throwaway, deleted before commit)**

Write `scripts/tmp-bycollection-check.ts` using `@supabase/supabase-js` directly (NOT the Next client) that reproduces `byCollection`'s query logic inline for a mixed batch and prints the resolved names. Cover: an `{id}` (a real card_prints id), a `{set:'dsk',collector_number:'1'}` (EN), a `{set:'dsk',collector_number:'1',lang:'fr'}` (should get the FR print — printed_name "Cheerleader acrobatique"), a `{set, collector_number, lang:'fr'}` for a card with NO FR print (should fall back to EN), a `{name:'Lightning Bolt'}`, and a `{name:'Guivre laboureuse de tombes', lang:'fr'}` (FR printed_name → dka/116). Confirm order preserved and one deliberately-bogus identifier yields null. Delete the script before committing.

> Get sample ids: `docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -d postgres -tAc "select id from card_prints where set='dsk' and collector_number='1' and lang='en';"` and find a no-FR card: `... "select set, collector_number from card_prints p where lang='en' and not exists (select 1 from card_prints f where f.set=p.set and f.collector_number=p.collector_number and f.lang='fr') limit 1;"`

- [ ] **Step 4: Commit** (index.ts only — throwaway deleted)

```bash
git add src/lib/card/catalog-db/index.ts
git commit -m "$(printf 'feat(catalog-db): byCollection resolves id/set+number/name/oracle/external ids\n\nGroups identifiers by form, bounded queries per group, prefers requested lang\nwith intra-DB EN fallback, preserves input order. Prerequisite for the 1b\nintent functions.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Pass structured identifiers through `card-source.getCardCollection`

**Files:**

- Modify: `src/lib/card/source/index.ts`

**Interfaces:**

- Consumes: the new `byCollection(identifiers, opts?)` from Task 1.
- Produces: `getCardCollection` unchanged return type (`Promise<ScryfallList<ScryfallCard>>`), now resolving set+number/name identifiers from the DB before falling back.

- [ ] **Step 1: Pass identifiers through**

In `src/lib/card/source/index.ts`, change the one line:

```ts
// before
const dbResults = await db.byCollection(identifiers.map((i) => i.id ?? ''));
// after
const dbResults = await db.byCollection(identifiers);
```

Everything else in `getCardCollection` (the miss collection, the batched Scryfall fallback, the not_found lockstep merge, order preservation) is UNCHANGED — it already keys off `dbResults[i]` being null/non-null per input index, which the new `byCollection` still provides in order.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → now fully clean (the Task 1 call-site mismatch is resolved). Run `npx eslint src/lib/card/source/index.ts` → clean.

- [ ] **Step 3: Runtime spot-check (throwaway, deleted before commit)**

This function uses the Next server client transitively (via `catalog-db`), so it can't run in a bare `tsx` script. Instead verify via the dev server against a page/flow that calls `getCardCollection` — OR defer the true end-to-end to the consumer-migration specs (1b-2/1b-3). Minimum here: confirm tsc/eslint clean and that the merge logic is untouched (git diff shows only the one-line change). If a dev-server path is readily reachable (e.g. a deck/collection list that batch-resolves), load it and confirm cards still render and that set+number identifiers no longer produce a Scryfall `/cards/collection` call for catalog cards (check the dev log). Note in the report whether you did the dev-server check or deferred it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/source/index.ts
git commit -m "$(printf 'feat(card-source): getCardCollection resolves set+number/name via DB\n\nPass structured identifiers to the extended byCollection instead of only ids,\nso non-id identifiers resolve from the catalog before the Scryfall fallback.\nMerge/fallback logic unchanged.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Final check

**Files:** none.

- [ ] **Step 1: Full project check**

Run: `npm run check`
Expected: no NEW problems beyond baseline; the 2 changed files clean under `npx eslint`.

- [ ] **Step 2: Confirm no regression in getCardCollection callers**

The 5 callers of `getCardCollection` (`resolveCardsByScryfallIds`, `hydrateAllParts`, `useEdhrecRecommendations`, `useResolveDeckList`, `useImportPreviewFetch`) are NOT migrated to `card-source` yet (they still import from `scryfall/endpoints/cards`), so they are unaffected by this change. Confirm with: `grep -rn "getCardCollection" src/ | grep "card/source"` shows only the definition, and no consumer import changed. (Migrating them is 1b-2/1b-3.)

- [ ] **Step 3: No commit** (verification only). Sub-project 1b-1 complete.

---

## Self-Review

**Spec coverage:**

- byCollection new signature (`ScryfallCardIdentifier[]`, `opts.lang`) → Task 1. ✔
- Per-form resolution (id / set+number / name / oracle / mtgo / multiverse) → Task 1 `resolveOne`. ✔
- Intra-DB EN fallback (set+number same key; name FR-then-EN) → Task 1 `pickByLang` + name branch. ✔
- Bounded grouped queries, no unbounded `.or()` → Task 1 `OR_CHUNK` chunking per group. ✔
- Order preservation, null per unresolved slot → Task 1 `identifiers.map(resolveOne)`. ✔
- card-source.getCardCollection passes structured identifiers → Task 2. ✔
- catalog-db stays pure (no Scryfall) → Task 1 adds no Scryfall import. ✔
- Out of scope (intent functions, consumer migration, import cascade) → not touched. ✔

**Placeholder scan:** No TBD/TODO. The `void printRowById;` line is explicitly flagged as removable scaffolding with instructions — the implementer removes it if unused; not a shipped placeholder.

**Type consistency:** `byCollection(identifiers, opts?)` signature matches its Task 2 call site. `PrintRow` fields read in `resolveOne` (`printed_name`/`lang`/`mtgo_id`/`multiverse_ids`/`oracle_id`/`set`/`collector_number`/`id`) are all in the 1a `PrintRow` type + `PRINT_COLS`. `assemblePrints`/`PRINT_COLS` reused as named in 1a. `ScryfallCardIdentifier` fields (`id`/`set`/`collector_number`/`name`/`oracle_id`/`mtgo_id`/`multiverse_id`/`lang`) match the existing type.
