# MPC Ingestion Pipeline Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the MPC ingestion pipeline so every card arrives in the DB with its correct Oracle name and `oracle_id` in a single pass — no silent enrichment failures.

**Architecture:** Inline Scryfall resolution per card before upsert: try set+collector_number first (exact GET), then name candidates (cardName then non-tag variants) via POST /cards/collection, then fuzzy GET for cards (not tokens). A new `display_name` column preserves the human-readable filename name while `name` becomes the canonical Oracle name used for lookups and grouping.

**Tech Stack:** TypeScript, tsx (script runner), Supabase JS client, Scryfall REST API, pLimit, Google Drive API v3.

---

## File Map

| File                                                      | Action      | Responsibility                                                                                            |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/mpc/mpc-tags.ts`                                 | **Create**  | Exhaustive set of known MPC tag strings (from `mpc_fil_format.txt`) — used to filter non-card variants    |
| `src/lib/mpc/scryfall-resolver.ts`                        | **Create**  | `resolveCard()` — inline Scryfall resolution with all 3 strategies, throttle, token/card distinction      |
| `src/lib/mpc/parse-filename.ts`                           | **Modify**  | No logic change — types only: export stays identical                                                      |
| `scripts/ingest-mpc-cards.ts`                             | **Rewrite** | Remove two-pass enrichment, call `resolveCard()` inline, write `display_name`, explicit unresolved report |
| `supabase/migrations/20260605000002_add_display_name.sql` | **Create**  | Add `display_name text` column to `custom_cards`                                                          |
| `src/lib/supabase/custom-cards.ts`                        | **Modify**  | Read `display_name` from DB row, expose on `MpcCard`                                                      |
| `src/lib/mpc/types.ts`                                    | **Modify**  | Add `displayName?: string` to `MpcCard` and `CustomCardMeta`                                              |

---

## Task 1: MPC tag set

**Files:**

- Create: `src/lib/mpc/mpc-tags.ts`

This module exports a `Set<string>` of all known MPC tag values (canonical names + all aliases from `mpc_fil_format.txt`), lowercased. Used by `resolveCard` to skip variants that are styling tags, not card names.

- [ ] **Step 1: Create the file**

```typescript
// src/lib/mpc/mpc-tags.ts

// All canonical tag names and aliases from mpc_fil_format.txt, lowercased.
// A variant matching any of these is a styling tag, not a Scryfall card name.
const MPC_TAG_STRINGS = [
	// Art
	'art',
	'altered art',
	'altered',
	'filtered',
	'pixel art',
	'pixelated',
	'pixelized',
	'pop-out art',
	'popout art',
	'pop-out',
	'popout',
	'sketch art',
	'sketchified',
	'custom art',
	'alt art',
	'alternate',
	'alt',
	'alternate art',
	'ai art',
	'ai',
	'midjourney',
	'genai',
	'ai remaster',
	'artist art',
	'third party art',
	'3rd party art',
	'switched art',
	'upscaled scan',
	'upscaled',
	'upscaled art',
	'scryfall scan',
	'upscaled scryfall scan',
	// Frame
	'frame',
	'borderless',
	'borderless art',
	'borderless frame',
	'post-2023 borderless',
	'borderless 2023',
	'borderless alt',
	'custom-made frame',
	'custom frame',
	'ai frame',
	'minimalist',
	'minimalist frame',
	'min',
	'stonecutter',
	'stonecutter frame',
	'extended-art',
	'extended',
	'extended art',
	'extended frame',
	'extended art frame',
	'fnm promo',
	'fnm promo frame',
	'fnm frame',
	'universal promo frame',
	'universal promo',
	'wpn promo frame',
	'wpn promo',
	'foil-etched',
	'foil-etched frame',
	'etched frame',
	'etched',
	'full text',
	'full text frame',
	'futureshifted',
	'futureshifted frame',
	'fut frame',
	'future sight frame',
	'future shifted frame',
	'future shifted',
	'm15',
	'm15 frame',
	'regular frame',
	'modern',
	'modern frame',
	'eighth edition frame',
	'8th edition frame',
	'eighth edition',
	'8th edition',
	'8ed',
	'planeshifted',
	'planeshifted frame',
	'colorshifted frame',
	'planar chaos frame',
	'plc frame',
	'retro',
	'retro frame',
	'ancient frame',
	'ancient',
	'original frame',
	'og frame',
	'alpha',
	'beta',
	'unlimited',
	'abu',
	'classic',
	'showcase',
	'showcase frame',
	'extension showcase frame',
	'extension frame',
	'amonkhet invocations',
	'akh invocations',
	'capenna art deco',
	'snc art deco frame',
	'capenna art deco frame',
	'new capenna art deco',
	'new capenna art deco frame',
	'capenna golden age',
	'snc golden age frame',
	'capenna golden age frame',
	'new capenna golden age',
	'new capenna golden age frame',
	'capenna skyscraper',
	'snc skyscraper frame',
	'capenna skyscraper frame',
	'new capenna skyscraper',
	'new capenna skyscraper frame',
	'classicshifted',
	'classicshifted frame',
	'commander legends',
	'commander legends frame',
	'cmr frame',
	'd&d module',
	'd&d module frame',
	'd&d sourcebook',
	'd&d sourcebook frame',
	'doctor who tardis',
	'doctor who tardis frame',
	'who frame',
	'doctor who',
	'tardis',
	'tardis frame',
	'dominaria stained glass',
	'dmu frame',
	'stained glass frame',
	'dominaria stained glass frame',
	'stained glass',
	'eldraine enchanting tales',
	'wot frame',
	'enchanting tales frame',
	'enchanting tales',
	'eldraine enchanting tales frame',
	'eldraine storybook',
	'eld frame',
	'woe frame',
	'eldraine frame',
	'wilds of eldraine frame',
	'storybook frame',
	'eldraine storybook frame',
	'english mystical archive',
	'en sta frame',
	'fca showcase',
	'fca showcase frame',
	'fca frame',
	'final fantasy frame',
	'borderless source material',
	'source material',
	'ikoria crystal',
	'ikoria crystal frame',
	'crystal frame',
	'innistrad equinox',
	'mid frame',
	'innistrad equinox frame',
	'equinox frame',
	'midnight hunt frame',
	'innistrad fang',
	'vow frame',
	'fang frame',
	'crimson vow frame',
	'innistrad fang frame',
	'ixalan coin',
	'ixalan coin frame',
	'coin frame',
	'japanese mystical archive',
	'jp sta frame',
	'japan showcase',
	'japan showcase frame',
	'jp showcase',
	'jp showcase frame',
	'kaladesh inventions',
	'kld inventions',
	'kaldheim viking',
	'khm frame',
	'viking frame',
	'kaldheim frame',
	'kaldheim viking frame',
	'kamigawa neon',
	'neo neon frame',
	'kamigawa neon frame',
	'neon dynasty neon frame',
	'neon frame',
	'kamigawa ninja',
	'neo ninja frame',
	'kamigawa ninja frame',
	'neon dynasty ninja frame',
	'ninja frame',
	'kamigawa samurai',
	'neo samurai frame',
	'kamigawa samurai frame',
	'neon dynasty samurai frame',
	'samurai frame',
	'lotr ring',
	'ltr frame',
	'lotr ring frame',
	'ring frame',
	'lotr scrolls of middle-earth',
	'lotr scrolls of middle-earth frame',
	'scrolls of middle-earth frame',
	'scrolls of middle-earth',
	'm21 spellbook',
	'm21 frame',
	'signature spellbook frame',
	'signature spellbook',
	'm21 spellbook frame',
	'phyrexia oil',
	'one oil frame',
	'phyrexia oil frame',
	'oil frame',
	'phyrexian oil',
	'phyrexian oil frame',
	'ravnica architecture',
	'ravnica architecture frame',
	'architecture frame',
	'sketch frame',
	'mh2 frame',
	'sketch',
	'tarkir dragon wing',
	'tarkir dragon wing frame',
	'dragon wing frame',
	'theros nyx',
	'thb frame',
	'nyx frame',
	'theros beyond death frame',
	'theros nyx frame',
	'zendikar expeditions',
	'bfz expeditions',
	'exp frame',
	'zendikar hedron',
	'znr frame',
	'hedron frame',
	'zendikar rising frame',
	'zendikar hedron frame',
	'zendikar rising expeditions',
	'znr expeditions',
	'zne frame',
	'universes beyond',
	'ub frame',
	'universes beyond frame',
	'ub',
	'full-art',
	'full art',
	'full-art frame',
	'full art frame',
	'fullart frame',
	'fullart',
	// Misc
	'alternate name',
	'nickname',
	'godzilla nickname',
	'godzilla',
	'eternal night card',
	'black & white card',
	'realistic',
	'realistic wotc card',
	'realistic card',
	'secret lair',
	'secret lair card',
	'sld',
	'sld card',
	'textless',
	'textless card',
	'non-black border',
	'non-black',
	'special border',
	'unusual border',
	'gold border',
	'commemorative border',
	'collectors edition border',
	'world championship deck border',
	'world championship border',
	'wc border',
	'30th anniversary edition border',
	'30th anniversary border',
	'30a border',
	'silver border',
	'unset border',
	'white border',
	'unlimited border',
	'nsfw',
	'nsfw art',
	'not safe for work',
	'not safe for work art',
	'nudity',
	'nudity art',
	'gore',
	'gore art',
	// Universe
	'universe',
	'anime',
	'hatsune miku',
	'miku',
	'avatar the last airbender',
	'avatar',
	'tla',
	'tle',
	'dr who',
	'who',
	'fallout',
	'pip',
	'final fantasy',
	'fin',
	'ff',
	'in-multiverse',
	'mip',
	'uw',
	'universes within',
	'magic ip',
	'om1',
	'through the omenpaths',
	'league of legends',
	'lord of the rings',
	'ltr',
	'lotr',
	'my little pony',
	'mlp',
	'ponies the galloping',
	'spider-man',
	'spm',
	'spe',
	'warhammer 40k',
	'40k',
	'warhammer',
	// Common freeform variants that are never card names
	'normal',
	'v2',
	'v3',
	'v4',
	'pinlines',
	'foil',
];

export const MPC_TAGS: Set<string> = new Set(MPC_TAG_STRINGS.map((t) => t.toLowerCase()));

export function isMpcTag(value: string): boolean {
	return MPC_TAGS.has(value.toLowerCase());
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mpc/mpc-tags.ts
git commit -m "feat(mpc): add MPC tag set for variant filtering"
```

---

## Task 2: DB migration — `display_name`

**Files:**

- Create: `supabase/migrations/20260605000002_add_display_name.sql`

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260605000002_add_display_name.sql
ALTER TABLE public.custom_cards
  ADD COLUMN IF NOT EXISTS display_name text;
```

- [ ] **Step 2: Apply the migration**

```bash
npm run sb:migrate
```

Expected output: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260605000002_add_display_name.sql
git commit -m "feat(db): add display_name column to custom_cards"
```

---

## Task 3: `MpcCard` and `CustomCardMeta` types

**Files:**

- Modify: `src/lib/mpc/types.ts`

Add `displayName` to `MpcCard` and `display_name` to `CustomCardMeta`.

- [ ] **Step 1: Add `display_name` to `CustomCardMeta`**

In `src/lib/mpc/types.ts`, find the `CustomCardMeta` interface and add one field:

```typescript
export interface CustomCardMeta {
	source_id: string | null;
	source_name: string;
	source_type: CardSourceType;
	card_type: CardType;
	image_url: string;
	lang: string | null;
	tags: string[];
	variants: string[];
	set_code: string | null;
	collector_number: string | null;
	is_public: boolean;
	raw_name: string;
	display_name: string | null; // ← add this
}
```

- [ ] **Step 2: Add `displayName` to `MpcCard`**

In `src/lib/mpc/types.ts`, find the `MpcCard` interface and add one field after `rawName`:

```typescript
export interface MpcCard {
	id: string;
	name: string;
	rawName: string;
	displayName: string | null; // ← add this
	sourceId: string | null;
	// ... rest unchanged
}
```

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: type errors in `adapter.ts` and `custom-cards.ts` (they don't supply `displayName` yet) — that is expected and will be fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mpc/types.ts
git commit -m "feat(types): add displayName to MpcCard and CustomCardMeta"
```

---

## Task 4: Update adapter and custom-cards client

**Files:**

- Modify: `src/lib/mpc/adapter.ts`
- Modify: `src/lib/supabase/custom-cards.ts`

Wire `display_name` from DB row through to `MpcCard` and `CustomCard`.

- [ ] **Step 1: Update `adapter.ts`**

In `src/lib/mpc/adapter.ts`, add `display_name` to the `custom` object in `toCustomCard`:

```typescript
export function toCustomCard(card: MpcCard, source: MpcSource): CustomCard {
	return {
		object: 'custom_card',
		id: `mpc:${card.id}`,
		name: card.name,
		...(card.oracleId ? { oracle_id: card.oracleId } : {}),
		colors: card.colors as ScryfallColor[] | undefined,
		color_identity: card.colorIdentity as ScryfallColor[] | undefined,
		cmc: card.cmc,
		type_line: card.typeLine,
		mana_cost: card.manaCost,
		oracle_text: card.oracleText,
		rarity: card.rarity as ScryfallRarity | undefined,
		set: card.setCode ?? undefined,
		set_name: card.setName,
		artist: card.artist,
		custom: {
			source_id: card.sourceId,
			source_name: source.name,
			source_type: card.sourceType,
			card_type: card.cardType,
			image_url: card.imageUrl,
			lang: card.language,
			tags: card.tags,
			variants: card.variants,
			set_code: card.setCode,
			collector_number: card.collectorNumber,
			is_public: card.isPublic,
			raw_name: card.rawName,
			display_name: card.displayName ?? null, // ← add this
		},
	};
}
```

- [ ] **Step 2: Update `CustomCardRow` in `custom-cards.ts`**

In `src/lib/supabase/custom-cards.ts`, add to the `CustomCardRow` interface:

```typescript
interface CustomCardRow {
	// ... existing fields ...
	display_name: string | null; // ← add this
}
```

- [ ] **Step 3: Update `rowToMpcCard` in `custom-cards.ts`**

In the `rowToMpcCard` function, add after `rawName`:

```typescript
function rowToMpcCard(row: CustomCardRow): MpcCard {
	return {
		id: row.id.startsWith('mpc:') ? row.id.slice(4) : row.id,
		name: row.name,
		rawName: row.raw_name,
		displayName: row.display_name ?? null, // ← add this
		// ... rest unchanged
	};
}
```

- [ ] **Step 4: Update `CUSTOM_CARD_SELECT`**

In `src/lib/supabase/custom-cards.ts`, add `display_name` to the select string:

```typescript
const CUSTOM_CARD_SELECT =
	'id, source_id, name, raw_name, display_name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, variants, set_code, collector_number, colors, color_identity, cmc, type_line, mana_cost, oracle_text, rarity, set_name, artist';
```

- [ ] **Step 5: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mpc/adapter.ts src/lib/supabase/custom-cards.ts
git commit -m "feat(mpc): wire display_name through adapter and supabase client"
```

---

## Task 5: Scryfall resolver module

**Files:**

- Create: `src/lib/mpc/scryfall-resolver.ts`

This is the core of the redesign. Pure function `resolveCard(parsed, cardType)` with no Supabase dependency — takes parsed filename data, returns Oracle enrichment or `null`.

- [ ] **Step 1: Create `scryfall-resolver.ts`**

```typescript
// src/lib/mpc/scryfall-resolver.ts
import type { ParsedCardFilename } from './parse-filename';
import type { CardType } from './types';
import { isMpcTag } from './mpc-tags';

const SCRYFALL_USER_AGENT = 'Wizcard/1.0';
const SCRYFALL_BASE = 'https://api.scryfall.com';

export interface ScryfallResolution {
	oracleName: string;
	oracleId: string;
	colors: string[];
	colorIdentity: string[];
	cmc: number | null;
	typeLine: string | null;
	manaCost: string | null;
	oracleText: string | null;
	rarity: string | null;
	setName: string | null;
	artist: string | null;
}

// Throttle: track last call time module-level (shared across calls in one process)
let lastScryfallMs = 0;
async function throttle(): Promise<void> {
	const elapsed = Date.now() - lastScryfallMs;
	if (elapsed < 100) await new Promise((r) => setTimeout(r, 100 - elapsed));
	lastScryfallMs = Date.now();
}

function normalizeForScryfall(name: string): string {
	// MPC uses & for split cards; Scryfall uses //
	return name.replace(/\s*&\s*/gu, ' // ').trim();
}

function extractEnrichment(card: Record<string, unknown>): ScryfallResolution {
	return {
		oracleName: card['name'] as string,
		oracleId: card['oracle_id'] as string,
		colors: (card['colors'] as string[] | undefined) ?? [],
		colorIdentity: (card['color_identity'] as string[] | undefined) ?? [],
		cmc: (card['cmc'] as number | undefined) ?? null,
		typeLine: (card['type_line'] as string | undefined) ?? null,
		manaCost: (card['mana_cost'] as string | undefined) ?? null,
		oracleText: (card['oracle_text'] as string | undefined) ?? null,
		rarity: (card['rarity'] as string | undefined) ?? null,
		setName: (card['set_name'] as string | undefined) ?? null,
		artist: (card['artist'] as string | undefined) ?? null,
	};
}

// Strategy A: lookup by set + collector number (exact, fast)
async function resolveBySetAndNumber(
	setCode: string,
	collectorNumber: string
): Promise<ScryfallResolution | null> {
	await throttle();
	const url = `${SCRYFALL_BASE}/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`;
	const res = await fetch(url, { headers: { 'User-Agent': SCRYFALL_USER_AGENT } });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Scryfall GET ${url} failed: HTTP ${res.status}`);
	const card = (await res.json()) as Record<string, unknown>;
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

// Strategy B: lookup by exact name via POST /cards/collection
async function resolveByName(name: string): Promise<ScryfallResolution | null> {
	await throttle();
	const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': SCRYFALL_USER_AGENT,
		},
		body: JSON.stringify({ identifiers: [{ name }] }),
	});
	if (!res.ok) throw new Error(`Scryfall POST /cards/collection failed: HTTP ${res.status}`);
	const data = (await res.json()) as { data: Record<string, unknown>[]; not_found: unknown[] };
	if (!data.data?.length) return null;
	const card = data.data[0];
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

// Strategy C: fuzzy name lookup (cards only, not tokens)
async function resolveByFuzzy(name: string): Promise<ScryfallResolution | null> {
	await throttle();
	const url = `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`;
	const res = await fetch(url, { headers: { 'User-Agent': SCRYFALL_USER_AGENT } });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Scryfall GET ${url} failed: HTTP ${res.status}`);
	const card = (await res.json()) as Record<string, unknown>;
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

export async function resolveCard(
	parsed: ParsedCardFilename,
	cardType: CardType,
	options: { fuzzy?: boolean } = {}
): Promise<ScryfallResolution | null> {
	// Cardbacks have no Oracle equivalent
	if (cardType === 'cardback') return null;

	const { fuzzy = true } = options;

	// Strategy A: set + collector number (fastest, most precise)
	if (parsed.setCode && parsed.collectorNumber) {
		try {
			const result = await resolveBySetAndNumber(parsed.setCode, parsed.collectorNumber);
			if (result) return result;
		} catch (err) {
			console.warn(`  ⚠ Strategy A failed for ${parsed.cardName}: ${(err as Error).message}`);
		}
	}

	// Build name candidates: cardName first, then variants that aren't MPC styling tags
	const candidates = [parsed.cardName, ...parsed.variants.filter((v) => !isMpcTag(v))]
		.map(normalizeForScryfall)
		.filter(Boolean);

	// Strategy B: exact name match for each candidate
	for (const candidate of candidates) {
		try {
			const result = await resolveByName(candidate);
			if (result) return result;
		} catch (err) {
			console.warn(`  ⚠ Strategy B failed for "${candidate}": ${(err as Error).message}`);
		}
	}

	// Strategy C: fuzzy — cards only (tokens have generic names like "Goblin" that would mismatch)
	if (fuzzy && cardType === 'card') {
		for (const candidate of candidates) {
			try {
				const result = await resolveByFuzzy(candidate);
				if (result) return result;
			} catch (err) {
				console.warn(`  ⚠ Strategy C failed for "${candidate}": ${(err as Error).message}`);
			}
		}
	}

	return null;
}
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mpc/scryfall-resolver.ts
git commit -m "feat(mpc): add inline Scryfall resolver with set+num, exact name, fuzzy strategies"
```

---

## Task 6: Rewrite `ingest-mpc-cards.ts`

**Files:**

- Modify: `scripts/ingest-mpc-cards.ts`

Replace the two-pass enrichment with inline `resolveCard()` calls. Write `display_name`. Emit an explicit unresolved report at the end of each source.

- [ ] **Step 1: Remove old enrichment functions and replace imports**

Replace the top of `scripts/ingest-mpc-cards.ts` up through the CLI args section with:

```typescript
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { parseCardFilename } from '../src/lib/mpc/parse-filename';
import { resolveCard } from '../src/lib/mpc/scryfall-resolver';

// ─── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY ?? '';
const MPCFILL_URL = 'https://mpcfill.com/2/sources/';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error('Missing SUPABASE_SERVICE_ROLE_KEY — set it in .env.local');
	process.exit(1);
}
if (!GOOGLE_DRIVE_API_KEY) {
	console.error('Missing GOOGLE_DRIVE_API_KEY — set it in .env.local');
	process.exit(1);
}

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterSourceId = args.find((a) => a.startsWith('--source='))?.split('=')[1];
const limitSources = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const skipScryfall = args.includes('--skip-scryfall');
const noFuzzy = args.includes('--no-fuzzy');
```

- [ ] **Step 2: Update `IngestResult` type**

Replace the `IngestResult` interface:

```typescript
interface IngestResult {
	newCount: number;
	skippedCount: number;
	failedCount: number;
	resolvedBySetNum: number;
	resolvedByName: number;
	resolvedByFuzzy: number;
	unresolvedFiles: string[]; // raw filenames that got no oracle_id
}
```

- [ ] **Step 3: Rewrite `ingestSource` — card processing loop**

Replace the card-processing loop inside `ingestSource` (the `limiter` block) with:

```typescript
let newCount = 0;
let skippedCount = 0;
let failedCount = 0;
let resolvedBySetNum = 0;
let resolvedByName = 0;
let resolvedByFuzzy = 0;
const unresolvedFiles: string[] = [];

const limiter = pLimit(5);
await Promise.all(
	files.map((file) =>
		limiter(async () => {
			const cardId = `mpc:${file.id}`;
			if (doneIds.has(cardId)) {
				skippedCount++;
				return;
			}

			const parsed = parseCardFilename(file.name);
			const setCode = parsed.setCode && validSetCodes.has(parsed.setCode) ? parsed.setCode : null;
			const { cardType, folderTags } = folderPathToMeta(file.folderPath);
			const allTags = [
				'custom:mpc',
				`mpc-source:${sourceId}`,
				...folderTags,
				...parsed.bracketTags,
			];

			// Inline Scryfall resolution
			let resolution = null;
			let resolveStrategy: 'set_num' | 'name' | 'fuzzy' | null = null;

			if (!skipScryfall) {
				// Pass parsed with validated setCode so resolver uses it correctly
				const parsedForResolve = { ...parsed, setCode };
				try {
					// Track which strategy succeeded by checking what we had available
					if (setCode && parsed.collectorNumber) {
						resolution = await resolveCard(parsedForResolve, cardType, { fuzzy: false });
						if (resolution) resolveStrategy = 'set_num';
					}
					if (!resolution) {
						resolution = await resolveCard(
							{ ...parsedForResolve, setCode: null, collectorNumber: null },
							cardType,
							{ fuzzy: false }
						);
						if (resolution) resolveStrategy = 'name';
					}
					if (!resolution && !noFuzzy && cardType === 'card') {
						resolution = await resolveCard(
							{ ...parsedForResolve, setCode: null, collectorNumber: null },
							cardType,
							{ fuzzy: true }
						);
						if (resolution) resolveStrategy = 'fuzzy';
					}
				} catch (err) {
					console.warn(`  ⚠ Resolution failed for ${file.name}: ${(err as Error).message}`);
				}
			}

			if (resolveStrategy === 'set_num') resolvedBySetNum++;
			else if (resolveStrategy === 'name') resolvedByName++;
			else if (resolveStrategy === 'fuzzy') resolvedByFuzzy++;
			else if (!skipScryfall) unresolvedFiles.push(file.name);

			const { error: cardErr } = await supabase.from('custom_cards').upsert({
				id: cardId,
				source_id: sourceId,
				name: resolution?.oracleName ?? parsed.cardName,
				display_name: parsed.cardName,
				raw_name: file.name,
				set_code: setCode,
				collector_number: setCode ? parsed.collectorNumber : null,
				variants: parsed.variants,
				image_drive_url: driveImageUrl(file.id),
				tags: allTags,
				is_public: true,
				card_type: cardType,
				language: parsed.language,
				oracle_id: resolution?.oracleId ?? null,
				enriched_at: resolution ? new Date().toISOString() : null,
				colors: resolution?.colors ?? [],
				color_identity: resolution?.colorIdentity ?? [],
				cmc: resolution?.cmc ?? null,
				type_line: resolution?.typeLine ?? null,
				mana_cost: resolution?.manaCost ?? null,
				oracle_text: resolution?.oracleText ?? null,
				rarity: resolution?.rarity ?? null,
				set_name: resolution?.setName ?? null,
				artist: resolution?.artist ?? null,
			});

			if (cardErr) {
				console.warn(`  ⚠ Card upsert failed for ${cardId}: ${cardErr.message}`);
				failedCount++;
				return;
			}

			newCount++;
		})
	)
);
```

- [ ] **Step 4: Update the source summary log**

Replace the log block after the processing loop:

```typescript
console.log(`${prefix} — ✓ ${newCount} new, ${skippedCount} skipped, ${failedCount} failed`);
if (!skipScryfall) {
	console.log(
		`${prefix} — Scryfall: ${resolvedBySetNum} by set+num, ${resolvedByName} by name, ${resolvedByFuzzy} by fuzzy, ${unresolvedFiles.length} unresolved`
	);
	if (unresolvedFiles.length > 0) {
		console.warn(`${prefix} — Unresolved files:`);
		for (const f of unresolvedFiles) console.warn(`    • ${f}`);
	}
}
```

- [ ] **Step 5: Update `ingestSource` return value**

```typescript
return {
	newCount,
	skippedCount,
	failedCount,
	resolvedBySetNum,
	resolvedByName,
	resolvedByFuzzy,
	unresolvedFiles,
};
```

- [ ] **Step 6: Remove the old `enrichSourceWithScryfall`, `applyScryfallBatch`, `enrichBySetAndNumber` functions entirely** — they are replaced by `resolveCard` in the resolver module.

- [ ] **Step 7: Update `main()` totals**

Replace the `totals` reduce and final log:

```typescript
const totals = results.reduce(
	(acc, r) => ({
		newCount: acc.newCount + r.newCount,
		skippedCount: acc.skippedCount + r.skippedCount,
		failedCount: acc.failedCount + r.failedCount,
		resolvedBySetNum: acc.resolvedBySetNum + r.resolvedBySetNum,
		resolvedByName: acc.resolvedByName + r.resolvedByName,
		resolvedByFuzzy: acc.resolvedByFuzzy + r.resolvedByFuzzy,
		unresolvedFiles: [...acc.unresolvedFiles, ...r.unresolvedFiles],
	}),
	{
		newCount: 0,
		skippedCount: 0,
		failedCount: 0,
		resolvedBySetNum: 0,
		resolvedByName: 0,
		resolvedByFuzzy: 0,
		unresolvedFiles: [] as string[],
	}
);

console.log('\n✅ Ingestion complete.');
console.log(`   Sources processed  : ${sourcesOk}`);
if (sourcesFailed > 0) console.log(`   Sources failed     : ${sourcesFailed}`);
console.log(`   Cards new          : ${totals.newCount}`);
console.log(`   Cards skipped      : ${totals.skippedCount}`);
if (totals.failedCount > 0) console.log(`   Cards failed       : ${totals.failedCount}`);
if (!skipScryfall) {
	console.log(`   Resolved set+num   : ${totals.resolvedBySetNum}`);
	console.log(`   Resolved by name   : ${totals.resolvedByName}`);
	if (totals.resolvedByFuzzy > 0) console.log(`   Resolved by fuzzy  : ${totals.resolvedByFuzzy}`);
	if (totals.unresolvedFiles.length > 0) {
		console.warn(`   ⚠ Unresolved total : ${totals.unresolvedFiles.length}`);
	}
}
```

- [ ] **Step 8: Remove unused variables**

Remove `forceReenrich` from CLI args (no longer needed — base is always reset). Remove `SCRYFALL_COLLECTION_URL`, `SCRYFALL_SETS_URL`, `SCRYFALL_BATCH_SIZE`, `SCRYFALL_USER_AGENT` constants. Remove `fetchScryfallSetCodes()` function and its call in `main()` — set code validation now uses the existing `validSetCodes` set (keep fetching it for set code validation, just remove the Scryfall enrichment constants).

> Note: `validSetCodes` is still needed to validate that a parsed `setCode` from a filename is a real Scryfall set before passing it to `resolveCard`. Keep `fetchScryfallSetCodes()` and its call in `main()`.

- [ ] **Step 9: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add scripts/ingest-mpc-cards.ts
git commit -m "feat(ingest): inline Scryfall resolution per card, add display_name, explicit unresolved report"
```

---

## Task 7: Strategy tracking refactor (clean up resolver call duplication)

The Task 6 loop calls `resolveCard` three times to track which strategy matched. This is fragile. Refactor `resolveCard` to return which strategy succeeded.

**Files:**

- Modify: `src/lib/mpc/scryfall-resolver.ts`
- Modify: `scripts/ingest-mpc-cards.ts`

- [ ] **Step 1: Update `ScryfallResolution` to include strategy**

In `src/lib/mpc/scryfall-resolver.ts`, add `strategy` to the return type:

```typescript
export interface ScryfallResolution {
	oracleName: string;
	oracleId: string;
	strategy: 'set_num' | 'name' | 'fuzzy';
	colors: string[];
	colorIdentity: string[];
	cmc: number | null;
	typeLine: string | null;
	manaCost: string | null;
	oracleText: string | null;
	rarity: string | null;
	setName: string | null;
	artist: string | null;
}
```

- [ ] **Step 2: Set `strategy` in `resolveCard`**

In `resolveCard`, after each successful resolution, tag the result before returning:

```typescript
// Strategy A
if (parsed.setCode && parsed.collectorNumber) {
	try {
		const result = await resolveBySetAndNumber(parsed.setCode, parsed.collectorNumber);
		if (result) return { ...result, strategy: 'set_num' };
	} catch (err) {
		/* warn */
	}
}

// Strategy B
for (const candidate of candidates) {
	try {
		const result = await resolveByName(candidate);
		if (result) return { ...result, strategy: 'name' };
	} catch (err) {
		/* warn */
	}
}

// Strategy C
if (fuzzy && cardType === 'card') {
	for (const candidate of candidates) {
		try {
			const result = await resolveByFuzzy(candidate);
			if (result) return { ...result, strategy: 'fuzzy' };
		} catch (err) {
			/* warn */
		}
	}
}
```

- [ ] **Step 3: Simplify the loop in `ingest-mpc-cards.ts`**

Replace the three separate `resolveCard` calls with one:

```typescript
let resolution: ScryfallResolution | null = null;
if (!skipScryfall) {
	try {
		resolution = await resolveCard({ ...parsed, setCode }, cardType, { fuzzy: !noFuzzy });
	} catch (err) {
		console.warn(`  ⚠ Resolution failed for ${file.name}: ${(err as Error).message}`);
	}
}

if (resolution?.strategy === 'set_num') resolvedBySetNum++;
else if (resolution?.strategy === 'name') resolvedByName++;
else if (resolution?.strategy === 'fuzzy') resolvedByFuzzy++;
else if (!skipScryfall) unresolvedFiles.push(file.name);
```

- [ ] **Step 4: Add import for `ScryfallResolution` type in ingest script**

```typescript
import { resolveCard, type ScryfallResolution } from '../src/lib/mpc/scryfall-resolver';
```

- [ ] **Step 5: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mpc/scryfall-resolver.ts scripts/ingest-mpc-cards.ts
git commit -m "refactor(ingest): resolver returns strategy, simplify ingest tracking"
```

---

## Task 8: Smoke test — dry run against one source

No automated test suite for the ingestion script (it hits live APIs). Run a bounded smoke test.

- [ ] **Step 1: Reset the local DB**

```bash
npm run sb:reset
```

Expected: DB reset with no migration errors.

- [ ] **Step 2: Run ingestion on a single source with skip-scryfall first**

```bash
npx tsx scripts/ingest-mpc-cards.ts --limit=1 --skip-scryfall
```

Expected: cards ingested, `display_name` populated, `oracle_id = null` for all.

Verify in Supabase Studio (`npm run sb:studio`, port 54323): open `custom_cards` table, confirm `display_name` column is present and filled.

- [ ] **Step 3: Reset DB again and run with Scryfall resolution**

```bash
npm run sb:reset
npx tsx scripts/ingest-mpc-cards.ts --limit=1
```

Expected output contains lines like:

```
Scryfall: N by set+num, M by name, K by fuzzy, J unresolved
```

Check in Studio: `oracle_id` non-null for resolved cards, `name` contains Oracle name, `display_name` contains the filename-parsed name.

- [ ] **Step 4: Verify the Dismember case specifically**

If the source has `'Tis But a Scratch! (Dismember).png`, query in Studio:

```sql
SELECT name, display_name, oracle_id FROM custom_cards WHERE display_name = '''Tis But a Scratch!';
```

Expected: `name = 'Dismember'`, `oracle_id` non-null.

- [ ] **Step 5: Commit**

No code changes — this task is validation only.

---

## Self-Review

**Spec coverage check:**

| Spec requirement                                      | Task                                                 |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Single-pass ingestion with inline resolution          | Task 6                                               |
| `resolveCard` with set+num → exact → fuzzy strategies | Task 5                                               |
| Filter MPC tags before Scryfall lookup                | Task 5 (`isMpcTag`)                                  |
| `&` → `//` normalization                              | Task 5 (`normalizeForScryfall`)                      |
| No fuzzy for tokens                                   | Task 5 (`cardType === 'card'` guard)                 |
| Cardbacks skip resolution                             | Task 5 (early return)                                |
| `display_name` column                                 | Task 2 (migration) + Task 3/4 (types/client)         |
| `name` = Oracle name in DB                            | Task 6 (`resolution?.oracleName ?? parsed.cardName`) |
| Explicit unresolved report                            | Task 6 (unresolvedFiles log)                         |
| `--no-fuzzy` flag                                     | Task 6 (CLI arg)                                     |
| `--skip-scryfall` flag                                | Task 6 (preserved)                                   |
| Cardbacks skip                                        | Task 5                                               |
| DB reset + re-ingest                                  | Task 8                                               |

**No gaps found.**
