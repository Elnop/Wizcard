# Custom Card Filename Parsing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse the community standard `Card Name (Variant) [SET] {N}` filename format to extract structured metadata, store it in the DB, and use set+collector_number for more reliable Scryfall enrichment.

**Architecture:** A shared `parseCardFilename()` module replaces the two divergent `normalizeName()` functions in the ingest script and API route. The DB gains three new columns (`set_code`, `collector_number`, `variants`). The Scryfall enrichment adds a Strategy A (set+num lookup) before the existing batch-name Strategy B.

**Tech Stack:** TypeScript, Supabase (Postgres), Scryfall REST API, `npx tsx` for running scripts

---

## File Map

| Action | Path                                                                | Purpose                                    |
| ------ | ------------------------------------------------------------------- | ------------------------------------------ |
| Create | `src/lib/mpc/parse-filename.ts`                                     | Shared filename parser                     |
| Create | `src/lib/mpc/parse-filename.test.ts`                                | Parser unit tests (run with `npx tsx`)     |
| Create | `supabase/migrations/20260604000000_add_parsed_filename_fields.sql` | DB migration                               |
| Modify | `scripts/ingest-mpc-cards.ts`                                       | Use parser, add Strategy A enrichment      |
| Modify | `src/app/api/mpc/index/route.ts`                                    | Use parser instead of inline normalizeName |

---

## Task 1: Create the filename parser

**Files:**

- Create: `src/lib/mpc/parse-filename.ts`
- Create: `src/lib/mpc/parse-filename.test.ts`

- [ ] **Step 1.1: Create the parser module**

Create `src/lib/mpc/parse-filename.ts` with this exact content:

```typescript
export interface ParsedCardFilename {
	cardName: string;
	variants: string[];
	bracketTags: string[];
	collectorNumber: string | null;
	extension: string | null;
}

const EXT_RE = /\.([a-zA-Z0-9]+)$/;
const VARIANT_RE = /\(([^)]*)\)/g;
const BRACKET_RE = /\[([^\]]*)\]/g;
const COLLECTOR_RE = /\{(\d+)\}/;
const METADATA_START_RE = /[([{]/;

export function parseCardFilename(filename: string): ParsedCardFilename {
	let rest = filename;

	const extMatch = EXT_RE.exec(rest);
	const extension = extMatch ? extMatch[1].toLowerCase() : null;
	if (extMatch) rest = rest.slice(0, extMatch.index);

	const metaStart = METADATA_START_RE.exec(rest);
	const cardName = (metaStart ? rest.slice(0, metaStart.index) : rest).trim();

	const variants: string[] = [];
	for (const m of rest.matchAll(VARIANT_RE)) variants.push(m[1].trim());

	const bracketTags: string[] = [];
	for (const m of rest.matchAll(BRACKET_RE)) bracketTags.push(m[1].trim());

	const collectorMatch = COLLECTOR_RE.exec(rest);
	const collectorNumber = collectorMatch ? collectorMatch[1] : null;

	return { cardName, variants, bracketTags, collectorNumber, extension };
}
```

- [ ] **Step 1.2: Write the test file**

Create `src/lib/mpc/parse-filename.test.ts` with this exact content:

```typescript
import { parseCardFilename } from './parse-filename';

type Case = {
	input: string;
	cardName: string;
	variants: string[];
	bracketTags: string[];
	collectorNumber: string | null;
	extension: string | null;
};

const cases: Case[] = [
	{
		input: "Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg",
		cardName: 'Ancient Tomb',
		variants: ["Balin's Tomb"],
		bracketTags: ['LTC'],
		collectorNumber: '357',
		extension: 'jpg',
	},
	{
		input: 'Elesh Norn, Mother of Machines (v2) [third party art, popout].png',
		cardName: 'Elesh Norn, Mother of Machines',
		variants: ['v2'],
		bracketTags: ['third party art, popout'],
		collectorNumber: null,
		extension: 'png',
	},
	{
		input: 'Lightning Bolt [M10] {127}.png',
		cardName: 'Lightning Bolt',
		variants: [],
		bracketTags: ['M10'],
		collectorNumber: '127',
		extension: 'png',
	},
	{
		input: 'Lightning Bolt.png',
		cardName: 'Lightning Bolt',
		variants: [],
		bracketTags: [],
		collectorNumber: null,
		extension: 'png',
	},
	{
		input: 'Jace, the Mind Sculptor (Extended) (Alt Art) [SLD] {123}.jpg',
		cardName: 'Jace, the Mind Sculptor',
		variants: ['Extended', 'Alt Art'],
		bracketTags: ['SLD'],
		collectorNumber: '123',
		extension: 'jpg',
	},
	{
		input: 'Ragavan, Nimble Pilferer',
		cardName: 'Ragavan, Nimble Pilferer',
		variants: [],
		bracketTags: [],
		collectorNumber: null,
		extension: null,
	},
];

let passed = 0;
let failed = 0;

for (const c of cases) {
	const result = parseCardFilename(c.input);
	const errors: string[] = [];

	if (result.cardName !== c.cardName)
		errors.push(`  cardName: got "${result.cardName}", want "${c.cardName}"`);
	if (JSON.stringify(result.variants) !== JSON.stringify(c.variants))
		errors.push(
			`  variants: got ${JSON.stringify(result.variants)}, want ${JSON.stringify(c.variants)}`
		);
	if (JSON.stringify(result.bracketTags) !== JSON.stringify(c.bracketTags))
		errors.push(
			`  bracketTags: got ${JSON.stringify(result.bracketTags)}, want ${JSON.stringify(c.bracketTags)}`
		);
	if (result.collectorNumber !== c.collectorNumber)
		errors.push(`  collectorNumber: got "${result.collectorNumber}", want "${c.collectorNumber}"`);
	if (result.extension !== c.extension)
		errors.push(`  extension: got "${result.extension}", want "${c.extension}"`);

	if (errors.length > 0) {
		console.error(`FAIL: ${c.input}`);
		errors.forEach((e) => console.error(e));
		failed++;
	} else {
		console.log(`PASS: ${c.input}`);
		passed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 1.3: Run the tests — expect all PASS**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsx src/lib/mpc/parse-filename.test.ts
```

Expected output:

```
PASS: Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg
PASS: Elesh Norn, Mother of Machines (v2) [third party art, popout].png
PASS: Lightning Bolt [M10] {127}.png
PASS: Lightning Bolt.png
PASS: Jace, the Mind Sculptor (Extended) (Alt Art) [SLD] {123}.jpg
PASS: Ragavan, Nimble Pilferer

6 passed, 0 failed
```

If any test fails, fix the parser logic in `parse-filename.ts` and re-run until all pass.

- [ ] **Step 1.4: Commit**

```bash
git add src/lib/mpc/parse-filename.ts src/lib/mpc/parse-filename.test.ts
git commit -m "feat(mpc): add parseCardFilename for community naming convention"
```

---

## Task 2: Add DB migration

**Files:**

- Create: `supabase/migrations/20260604000000_add_parsed_filename_fields.sql`

- [ ] **Step 2.1: Create the migration file**

Create `supabase/migrations/20260604000000_add_parsed_filename_fields.sql`:

```sql
ALTER TABLE custom_cards
  ADD COLUMN IF NOT EXISTS set_code         text,
  ADD COLUMN IF NOT EXISTS collector_number text,
  ADD COLUMN IF NOT EXISTS variants         text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS custom_cards_set_code_idx
  ON custom_cards (set_code)
  WHERE set_code IS NOT NULL;
```

- [ ] **Step 2.2: Apply the migration**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run sb:migrate
```

Expected: migration applies with no errors. If Supabase is not running, start it first with `npm run sb:start`.

- [ ] **Step 2.3: Commit**

```bash
git add supabase/migrations/20260604000000_add_parsed_filename_fields.sql
git commit -m "feat(db): add set_code, collector_number, variants columns to custom_cards"
```

---

## Task 3: Update the ingest script

**Files:**

- Modify: `scripts/ingest-mpc-cards.ts`

This task has two sub-parts: (A) use the parser at upsert time, (B) add Strategy A enrichment.

### Part A — use the parser at card upsert time

- [ ] **Step 3.1: Add the import at the top of the ingest script**

In `scripts/ingest-mpc-cards.ts`, after the existing imports (after line 6 `import pLimit from 'p-limit';`), add:

```typescript
import { parseCardFilename } from '../src/lib/mpc/parse-filename';
```

- [ ] **Step 3.2: Remove the old normalizeName function and KNOWN_SUFFIXES constant**

Remove lines 77–101 (the `KNOWN_SUFFIXES` constant and `normalizeName` function):

```typescript
// DELETE this entire block:
const KNOWN_SUFFIXES = [
	'Extended',
	'Borderless',
	'Alt Art',
	'Showcase',
	'Retro',
	'Promo',
	'Foil',
	'Etched',
	'Full Art',
];

function normalizeName(filename: string): string {
	const dot = filename.lastIndexOf('.');
	let name = dot !== -1 ? filename.slice(0, dot) : filename;
	for (const suffix of KNOWN_SUFFIXES) {
		name = name.replace(` (${suffix})`, '').replace(` (${suffix.toLowerCase()})`, '');
	}
	return name.trim();
}
```

- [ ] **Step 3.3: Update the card upsert to use the parser**

Find the upsert block inside `ingestSource()` (around line 382). Replace:

```typescript
const { error: cardErr } = await supabase.from('custom_cards').upsert({
	id: cardId,
	source_id: sourceId,
	name: normalizeName(file.name),
	raw_name: file.name,
	image_drive_url: driveImageUrl(file.id),
	tags: ['custom:mpc', `mpc-source:${sourceId}`],
	is_public: true,
});
```

With:

```typescript
const parsed = parseCardFilename(file.name);
const { error: cardErr } = await supabase.from('custom_cards').upsert({
	id: cardId,
	source_id: sourceId,
	name: parsed.cardName,
	raw_name: file.name,
	set_code: parsed.bracketTags[0] ?? null,
	collector_number: parsed.collectorNumber,
	variants: parsed.variants,
	image_drive_url: driveImageUrl(file.id),
	tags: ['custom:mpc', `mpc-source:${sourceId}`],
	is_public: true,
});
```

- [ ] **Step 3.4: Run TypeScript check to confirm no errors**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsc --noEmit
```

Expected: no errors. If there are type errors on the upsert object, it means the Supabase generated types don't yet include the new columns — that's expected until types are regenerated (not required for this plan).

### Part B — add Strategy A enrichment (set + collector_number)

- [ ] **Step 3.5: Update the ScryfallCardMinimal type to include set+collector fields**

Find the `ScryfallCardMinimal` interface (around line 54) and update it:

```typescript
interface ScryfallCardMinimal {
	oracle_id: string;
	name: string;
}
```

Replace with:

```typescript
interface ScryfallCardMinimal {
	oracle_id: string;
	name: string;
}

interface ScryfallSingleCard {
	oracle_id: string;
}
```

- [ ] **Step 3.6: Add the Scryfall rate-limit helper for GET requests**

After the existing `scryfallPost` function (around line 148), add:

```typescript
async function scryfallGet<T>(path: string): Promise<T | null> {
	const elapsed = Date.now() - lastScryfallCall;
	if (elapsed < 100) await sleep(100 - elapsed);
	lastScryfallCall = Date.now();

	const res = await fetch(`https://api.scryfall.com${path}`, {
		headers: { 'User-Agent': 'Wizcard/1.0' },
	});

	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Scryfall GET ${path} failed: HTTP ${res.status}`);
	return res.json() as Promise<T>;
}
```

- [ ] **Step 3.7: Add the Strategy A enrichment function**

After the `scryfallGet` function you just added, insert:

```typescript
async function enrichBySetAndNumber(
	sourceId: string,
	prefix: string
): Promise<{ matched: number; remaining: string[] }> {
	const { data: candidates, error } = await supabase
		.from('custom_cards')
		.select('id, set_code, collector_number')
		.eq('source_id', sourceId)
		.is('enriched_at', null)
		.not('set_code', 'is', null)
		.not('collector_number', 'is', null)
		.limit(100_000);

	if (error || !candidates || candidates.length === 0) {
		return { matched: 0, remaining: [] };
	}

	let matched = 0;
	const failedIds: string[] = [];
	const now = new Date().toISOString();

	for (const card of candidates) {
		const path = `/cards/${encodeURIComponent(card.set_code!.toLowerCase())}/${encodeURIComponent(card.collector_number!)}`;
		let result: ScryfallSingleCard | null = null;
		try {
			result = await scryfallGet<ScryfallSingleCard>(path);
		} catch (err) {
			console.warn(`${prefix} — ⚠ Strategy A GET failed for ${card.id}: ${(err as Error).message}`);
		}

		if (result?.oracle_id) {
			await supabase
				.from('custom_cards')
				.update({ oracle_id: result.oracle_id, enriched_at: now })
				.eq('id', card.id);
			matched++;
		} else {
			failedIds.push(card.id);
		}
	}

	if (matched > 0) console.log(`${prefix} — Strategy A: ${matched} matched by set+num`);

	return { matched, remaining: failedIds };
}
```

- [ ] **Step 3.8: Wire Strategy A into the enrichment pipeline**

Find the `enrichSourceWithScryfall` function (around line 264). Replace the whole function with:

```typescript
async function enrichSourceWithScryfall(
	sourceId: string,
	prefix: string
): Promise<{ matched: number; unmatched: number; failed: number }> {
	// Strategy A: set + collector_number lookup
	const { matched: matchedA } = await enrichBySetAndNumber(sourceId, prefix);

	// Strategy B: batch name lookup for everything still unenriched
	const { data: unenriched, error } = await supabase
		.from('custom_cards')
		.select('id, name')
		.eq('source_id', sourceId)
		.is('enriched_at', null)
		.limit(100_000);

	if (error) {
		console.warn(`${prefix} — ⚠ Scryfall enrichment query failed: ${error.message}`);
		return { matched: matchedA, unmatched: 0, failed: 0 };
	}

	if (!unenriched || unenriched.length === 0) {
		return { matched: matchedA, unmatched: 0, failed: 0 };
	}

	const nameToIds = new Map<string, string[]>();
	for (const card of unenriched) {
		const existing = nameToIds.get(card.name);
		if (existing) existing.push(card.id);
		else nameToIds.set(card.name, [card.id]);
	}

	const uniqueNames = Array.from(nameToIds.keys());
	let matchedB = 0;
	let unmatched = 0;
	let failed = 0;

	for (let i = 0; i < uniqueNames.length; i += SCRYFALL_BATCH_SIZE) {
		const batch = uniqueNames.slice(i, i + SCRYFALL_BATCH_SIZE);
		const r = await applyScryfallBatch(batch, nameToIds, prefix);
		matchedB += r.matched;
		unmatched += r.unmatched;
		failed += r.failed;
	}

	return { matched: matchedA + matchedB, unmatched, failed };
}
```

- [ ] **Step 3.9: Run TypeScript check**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.10: Commit**

```bash
git add scripts/ingest-mpc-cards.ts
git commit -m "feat(ingest): use parseCardFilename and add Strategy A set+num Scryfall enrichment"
```

---

## Task 4: Update the API route

**Files:**

- Modify: `src/app/api/mpc/index/route.ts`

- [ ] **Step 4.1: Add the import**

In `src/app/api/mpc/index/route.ts`, replace:

```typescript
import { NextResponse } from 'next/server';
import type { MpcIndexEntry } from '@/lib/mpc/types';
```

With:

```typescript
import { NextResponse } from 'next/server';
import type { MpcIndexEntry } from '@/lib/mpc/types';
import { parseCardFilename } from '@/lib/mpc/parse-filename';
```

- [ ] **Step 4.2: Remove the three inline regex constants and inline normalizeName**

Remove these lines (lines 9–18):

```typescript
// eslint-disable-next-line sonarjs/slow-regex
const SET_RE = /\s*\[[A-Z0-9]+\]\s*/g;
// eslint-disable-next-line sonarjs/slow-regex
const NUM_RE = /\s*\{\d+\}\s*/g;
// eslint-disable-next-line sonarjs/slow-regex
const VARIANT_RE = /\s*\([^)]+\)\s*$/;

function normalizeName(raw: string): string {
	return raw.replace(SET_RE, ' ').replace(NUM_RE, ' ').replace(VARIANT_RE, '').trim();
}
```

- [ ] **Step 4.3: Update the two call sites that used normalizeName**

Inside `buildIndex()`, find:

```typescript
entries.push({
    identifier: card.identifier,
    name: normalizeName(card.name),
    rawName: card.name,
```

Replace with:

```typescript
entries.push({
    identifier: card.identifier,
    name: parseCardFilename(card.name).cardName,
    rawName: card.name,
```

Inside the `GET` handler, find:

```typescript
const needle = normalizeName(rawName).toLowerCase();
```

Replace with:

```typescript
const needle = parseCardFilename(rawName).cardName.toLowerCase();
```

- [ ] **Step 4.4: Run TypeScript check and lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check
```

Expected: no TypeScript errors, no ESLint errors, no Prettier issues. Fix any formatting issues with `npm run check:fix`.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/api/mpc/index/route.ts
git commit -m "refactor(mpc): replace inline normalizeName with parseCardFilename in API route"
```

---

## Task 5: End-to-end verification

- [ ] **Step 5.1: Run the parser tests one final time**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsx src/lib/mpc/parse-filename.test.ts
```

Expected: `6 passed, 0 failed`

- [ ] **Step 5.2: Run a full check**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check
```

Expected: no errors.

- [ ] **Step 5.3: Dry-run ingest against one source (optional — requires live credentials)**

If `GOOGLE_DRIVE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are available in `.env.local`:

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsx scripts/ingest-mpc-cards.ts --source=mpcfill:TwoSheds --limit=1 --skip-scryfall
```

Expected: script runs, shows `N images found`, no TypeScript/runtime errors. Remove `--skip-scryfall` to test Strategy A enrichment (will make live Scryfall API calls).

- [ ] **Step 5.4: Final commit if any loose ends**

```bash
git status
# If clean, nothing to do. If any files uncommitted:
git add -p
git commit -m "chore: cleanup after filename parsing implementation"
```
