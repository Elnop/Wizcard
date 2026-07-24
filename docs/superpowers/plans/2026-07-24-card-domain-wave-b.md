# Card Domain Migration — Wave B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the seam (`rowsToScryfallCard` → `catalog-db` → `card/source`) emit the provider-neutral domain `Card`, and stop the assembler fabricating values to satisfy `ScryfallCard`'s required fields.

**Architecture:** Wave A already re-typed every consumer onto `Card`, so the seam has exactly two consumers and both are ready. Each `card/source` function is `db.x() ?? scry.x()`; because `ScryfallCard` is assignable to `Card`, re-declaring the return type as `Card` typechecks both arms with no body change. The substance of this wave is the assembler telling the truth (`undefined` instead of invented defaults).

**Tech Stack:** TypeScript (strict), Next.js App Router, Supabase/PostgREST. No test framework — **tsc is the authoritative gate** (baseline: `npx tsc --noEmit` = 0 errors).

## Global Constraints

- **tsc is authoritative.** `npx tsc --noEmit` MUST be 0 after every task. Baseline is 0 — any new error is a regression.
- **eslint gate = no NEW problems.** `npm run check` sits at exactly **51** pre-existing problems, all in untouched files. Gate each task with `npx eslint <changed files>`. Paths contain `[locale]`, which the shell glob-expands — always run eslint null-delimited: `git diff --name-only | tr '\n' '\0' | xargs -0 npx eslint`. Never gate on the total count.
- **NO new `as unknown as` casts.** The repo is at **12**; every task must end ≤ 12. When TypeScript says _"Conversion of type X to type Y may be a mistake… convert the expression to 'unknown' first"_, **that suggestion is the trap** — a Wave A attempt was reverted for taking it. Migrate the signature instead.
- **NO `any`, `@ts-ignore`, `@ts-expect-error`.**
- **No test framework.** Verify via tsc + eslint + the runtime checks in Task 5. Do not add vitest/jest.
- **Commits use `git commit --no-verify`** (lint-staged blocks on the RED baseline's pre-existing errors in any touched file).
- **Commit trailer** (every commit): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Branch:** main (user-consented for this chantier).
- **`Card.layout` is REQUIRED** (`layout: string`, `src/types/cards.ts:61`). It is the one field that keeps its `?? 'normal'` default. Do NOT make `Card.layout` optional and do NOT widen domain `Card` anywhere in this wave.
- **Out of scope — do NOT touch:** the prints subsystem (`useCardPrints`, `PrintList*`, `CardPrintPickerModal`, `UseCollectionCopyModal`, `ImportPreview`'s print flow) stays on `ScryfallCard` (deliberately frozen on Scryfall — the catalog is EN+FR only and that tab shows all languages); `scryfall/types/*`; the `CustomCard` base; `resolveCardsByScryfallIds`'s internal `fetched: ScryfallCard[]` buffer; `localizeTokens`' `fetchLocalized` dep; every `endpoints/cards.ts` function except `getCardCollection`.

---

## File Structure

- `src/lib/card/catalog-db/assembler.ts` — `rowsToScryfallCard` → `rowsToCard` returning `Card`; `buildFaces` returns `CardFace[]`; fabrication removed. Row interfaces unchanged (they describe stored JSON).
- `src/lib/card/catalog-db/index.ts` — 11 lookups return `Card`.
- `src/lib/card/source/index.ts` — 9 single-card fns return `Card`; `getCardCollection` returns `ScryfallList<Card>`.
- `src/lib/scryfall/endpoints/cards.ts` — only `getCardCollection` retypes to `ScryfallList<Card>`.

---

## Task 1: Assembler emits domain `Card` (the substance)

**Files:**

- Modify: `src/lib/card/catalog-db/assembler.ts`

**Interfaces:**

- Produces: `rowsToCard(args: { def: DefinitionRow; print: PrintRow; defFaces: DefinitionFaceRow[]; printFaces: PrintFaceRow[]; set?: SetRow | null }): Card` — replaces `rowsToScryfallCard`. Consumed by Task 2 (`catalog-db/index.ts`, one call site).
- `buildFaces(defFaces, printFaces): CardFace[] | undefined` (internal).
- The exported row interfaces (`DefinitionRow`, `PrintRow`, `DefinitionFaceRow`, `PrintFaceRow`, `SetRow`) are UNCHANGED — they describe the stored JSON, including `image_uris: ScryfallImageUris | null`.

**Background:** the assembler currently invents values because `ScryfallCard` requires them. Domain `Card` makes them optional, so each invented default becomes `undefined`. Measured against the seeded catalog (159 045 prints / 35 018 definitions) these columns are non-NULL in 100 % of rows, so this changes no currently-observable output — it stops the code claiming things the data does not say.

- [ ] **Step 1: Swap the imports**

Replace the `ScryfallCard`-family type import block at the top of the file with the domain types. The Scryfall image-uris type stays, because the ROW interfaces store it:

```typescript
import type { ScryfallImageUris } from '@/lib/scryfall/types/scryfall';
import type { Card, CardFace } from '@/types/cards';
```

Update the file's header comment: it currently says "rebuild a ScryfallCard-shaped object" — change to "rebuild a domain `Card`".

- [ ] **Step 2: `buildFaces` returns `CardFace[]`**

Replace the signature and the fabricated members. Domain `CardFace` has no `object`, and `name`/`mana_cost` are optional:

```typescript
function buildFaces(
	defFaces: DefinitionFaceRow[],
	printFaces: PrintFaceRow[]
): CardFace[] | undefined {
	if (defFaces.length === 0) return undefined;
	const byIndex = new Map(printFaces.map((p) => [p.face_index, p]));
	return [...defFaces]
		.sort((a, b) => a.face_index - b.face_index)
		.map((df): CardFace => {
			const pf = byIndex.get(df.face_index);
			return {
				name: df.name ?? undefined,
				mana_cost: df.mana_cost ?? undefined,
				type_line: df.type_line ?? undefined,
				oracle_text: df.oracle_text ?? undefined,
				colors: df.colors ?? undefined,
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
```

Note `colors` no longer needs `as ScryfallColors`: domain `CardFace.colors` is `MtgColor[]`, and the row's `string[] | null` may still need a cast — if tsc rejects `df.colors ?? undefined`, use `(df.colors as MtgColor[]) ?? undefined` (a narrow, sound cast of DB data whose values are the WUBRG letters) and import `MtgColor` from `@/types/cards`. Do NOT use `as unknown as`.

- [ ] **Step 3: Rename to `rowsToCard` and remove the fabrication**

```typescript
export function rowsToCard(args: {
	def: DefinitionRow;
	print: PrintRow;
	defFaces: DefinitionFaceRow[];
	printFaces: PrintFaceRow[];
	set?: SetRow | null;
}): Card {
	const { def, print, defFaces, printFaces, set } = args;
	const finishes = print.finishes ?? [];
	return {
		id: print.id,
		oracle_id: def.oracle_id,
		name: def.name,
		lang: print.lang,
		// layout is REQUIRED on domain Card, so it keeps a default.
		layout: def.layout ?? 'normal',
		released_at: print.released_at ?? undefined,
		image_status: print.image_status ?? undefined,
		cmc: def.cmc ?? undefined,
		type_line: def.type_line ?? undefined,
		oracle_text: def.oracle_text ?? undefined,
		mana_cost: def.mana_cost ?? undefined,
		colors: def.colors ?? undefined,
		color_identity: def.color_identity ?? undefined,
		keywords: def.keywords ?? undefined,
		legalities: def.legalities ?? undefined,
		reserved: def.reserved ?? undefined,
		power: def.power ?? undefined,
		toughness: def.toughness ?? undefined,
		loyalty: def.loyalty ?? undefined,
		defense: def.defense ?? undefined,
		edhrec_rank: def.edhrec_rank ?? undefined,
		set: print.set,
		set_name: set?.name ?? undefined,
		collector_number: print.collector_number,
		rarity: print.rarity ?? undefined,
		artist: print.artist ?? undefined,
		border_color: print.border_color ?? undefined,
		frame: print.frame ?? undefined,
		image_uris: print.image_uris ?? undefined,
		finishes,
		foil: finishes.includes('foil'),
		nonfoil: finishes.includes('nonfoil'),
		promo: print.promo ?? undefined,
		reprint: print.reprint ?? undefined,
		variation: print.variation ?? undefined,
		digital: print.digital ?? undefined,
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

Gone vs. before: `object: 'card'`, `set_id`, `set_type` (not on domain `Card`), and every invented default except `layout`. `colors` / `color_identity` / `image_status` / `legalities` may need the same kind of narrow cast as Step 2 if tsc rejects the raw row types (`string[] | null` → `MtgColor[]`, `string | null` → `CardImageStatus`, `unknown`/`Json` → `Record<string,string>`). Use a plain `as`, never `as unknown as`.

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/lib/card/catalog-db/index.ts` (it still calls `rowsToScryfallCard` and declares `ScryfallCard` returns). That file is Task 2. If any OTHER file errors, stop and report — it means something outside the seam depended on the fabricated fields.

- [ ] **Step 5: Verify eslint on this file**

Run: `npx eslint src/lib/card/catalog-db/assembler.ts`
Expected: clean. Remove any now-unused Scryfall type imports it flags.

- [ ] **Step 6: Commit**

```bash
git add src/lib/card/catalog-db/assembler.ts
git commit --no-verify -m "refactor(card): assembler emits domain Card and stops fabricating defaults

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `catalog-db` returns `Card`

**Files:**

- Modify: `src/lib/card/catalog-db/index.ts`

**Interfaces:**

- Consumes: `rowsToCard` from Task 1.
- Produces: `byId`, `bySetNumber`, `bySetNumberLang`, `byName`, `byMultiverseId`, `byMtgoId`, `byArenaId`, `byTcgplayerId`, `byCardmarketId` → `Promise<Card | null>`; `byCollection(identifiers)` → its existing shape with `Card`; `printsByOracleId` → `Promise<Card[]>`. Consumed by Task 3.

- [ ] **Step 1: Swap the call and the import**

Change `import { rowsToScryfallCard } from './assembler';` → `import { rowsToCard } from './assembler';` and the single call site `rowsToScryfallCard({…})` → `rowsToCard({…})`.

Replace the `ScryfallCard` type import with `import type { Card } from '@/types/cards';` (keep any other Scryfall imports the file genuinely uses, e.g. `ScryfallCardIdentifier` for `byCollection`'s parameter — that is request-protocol, not card data).

- [ ] **Step 2: Retype every return annotation**

Change each `Promise<ScryfallCard | null>` → `Promise<Card | null>`, `ScryfallCard[]` → `Card[]`, and any internal `Map<string, ScryfallCard>` / local annotations to `Card`. Bodies are otherwise unchanged.

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/lib/card/source/index.ts` (Task 3). Anything else = stop and report.

- [ ] **Step 4: Verify eslint**

Run: `npx eslint src/lib/card/catalog-db/index.ts`
Expected: clean; remove unused imports if flagged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/catalog-db/index.ts
git commit --no-verify -m "refactor(card): catalog-db lookups return domain Card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `card/source` returns `Card`

**Files:**

- Modify: `src/lib/card/source/index.ts`

**Interfaces:**

- Consumes: `catalog-db` returning `Card` (Task 2).
- Produces: nine single-card functions → `Promise<Card>`; `getCardCollection(identifiers: ScryfallCardIdentifier[])` → `Promise<ScryfallList<Card>>`. Consumed by `card/[id]/page.tsx` and `api/scryfall/cards/collection/route.ts` (both already accept `Card` — expect NO change in those files).

**Background:** every function is `return (await db.x(…)) ?? scry.x(…)`. The DB arm is now `Card`; the Scryfall arm is `ScryfallCard`, which is assignable to `Card`. So only the declared return types change — no body edits.

- [ ] **Step 1: Add the `Card` import**

Add `import type { Card } from '@/types/cards';`. Keep the `ScryfallCardIdentifier` and `ScryfallList` imports (`ScryfallList` is generic and is reused as `ScryfallList<Card>`). Drop `ScryfallCard` from the import if nothing else in the file uses it.

- [ ] **Step 2: Retype the nine single-card functions**

Change `Promise<ScryfallCard>` → `Promise<Card>` on `getCardById`, `getCardBySetNumber`, `getCardBySetNumberAndLang`, `getCardByName`, `getCardByMultiverseId`, `getCardByMtgoId`, `getCardByArenaId`, `getCardByTcgplayerId`, `getCardByCardmarketId`. Bodies unchanged.

- [ ] **Step 3: Retype `getCardCollection`**

`Promise<ScryfallList<ScryfallCard>>` → `Promise<ScryfallList<Card>>`. Any internal `ScryfallCard` annotations in the merge logic (arrays/maps holding results) become `Card`. `not_found` stays `ScryfallCardIdentifier[]`. Update the comment that says it matches `scry.getCardCollection`'s `ScryfallList<ScryfallCard>` shape.

- [ ] **Step 4: Verify tsc — this is the milestone**

Run: `npx tsc --noEmit`
Expected: **0 errors across the whole repo.** The two seam consumers already accept `Card`, so nothing downstream should break. If `card/[id]/page.tsx` or the collection route errors, stop and report — the Wave A migration missed something there.

- [ ] **Step 5: Verify eslint**

Run: `npx eslint src/lib/card/source/index.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/card/source/index.ts
git commit --no-verify -m "refactor(card): card-source returns domain Card (seam flipped)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Client `getCardCollection` returns `ScryfallList<Card>`

**Files:**

- Modify: `src/lib/scryfall/endpoints/cards.ts` (ONLY the `getCardCollection` function, around line 63)

**Interfaces:**

- Produces: `getCardCollection(identifiers: ScryfallCardIdentifier[], signal?: AbortSignal): Promise<ScryfallList<Card>>`.

**Background:** this client function posts to `/cards/collection`, which is in `PROXIED_ENDPOINTS` (`src/lib/scryfall/utils/fetcher.ts`) — it is served by our DB-first route, which after Task 3 returns domain cards; only the fallback path yields raw provider objects, and those are a superset of `Card`. So `Card` is honest for both. Every OTHER function in this file (`getCardById`, `getCardPrints`, search, etc.) hits real Scryfall and KEEPS `ScryfallCard`.

- [ ] **Step 1: Retype the function**

```typescript
export async function getCardCollection(
	identifiers: ScryfallCardIdentifier[],
	signal?: AbortSignal
): Promise<ScryfallList<Card>> {
	return scryfallPost<ScryfallList<Card>>('/cards/collection', { identifiers }, signal);
}
```

Add `import type { Card } from '@/types/cards';` if not present. Do NOT change any other function in this file.

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors. Callers (`getLocalizedPrint`, `useCustomFallbackPrint`, `resolveCardsByScryfallIds`, import hooks) were migrated to `Card` in Wave A, so they should accept this. If a caller errors because it feeds the result into a still-`ScryfallCard` sink, migrate that sink's signature to `Card` — do NOT cast, and do NOT touch the frozen prints subsystem (if the error lands there, stop and report).

- [ ] **Step 3: Verify eslint**

Run: `npx eslint src/lib/scryfall/endpoints/cards.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/endpoints/cards.ts
git commit --no-verify -m "refactor(card): client getCardCollection returns domain Card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wave B verification (types, casts, and the wire)

**Files:** none (verification only). This wave changes emitted data, so runtime proof is required, not optional.

- [ ] **Step 1: Static gates**

```bash
npx tsc --noEmit                                              # expect 0
grep -rn "as unknown as" src --include='*.ts' --include='*.tsx' | wc -l   # expect <= 12
grep -rn "@ts-ignore\|@ts-expect-error" src --include='*.ts' --include='*.tsx' | wc -l  # expect 0
npm run check 2>&1 | tail -5                                  # expect exactly 51 problems
```

If `npm run check` reports prettier issues in files this wave touched, run `npx prettier --write` on those files only (do NOT reformat `src/lib/card/components/EditCardModal/resolveLanguageChange.ts` or the email templates — those are pre-existing baseline).

- [ ] **Step 2: Confirm `rowsToScryfallCard` is fully gone**

```bash
grep -rn "rowsToScryfallCard" src scripts
```

Expected: no output.

- [ ] **Step 3: Start the dev server**

```bash
nohup env PORT=3011 npm run dev > /tmp/wave-b-dev.log 2>&1 &
```

Wait for `Ready in`. If the port is taken by a lingering server from an earlier session, kill that PID specifically (do NOT `pkill -f next-server`, which kills the agent's own process tree) or use a free port and adjust the URLs below.

- [ ] **Step 4: Card page renders in both locales (DB-served)**

Fetch `http://localhost:3011/en/card/004fdcbe-6dc9-40ad-9467-b89b72a4a8ca` and the `/fr/` equivalent (a real seeded print id; if the local DB was re-seeded, pick any id from `card_prints`). Use node's fetch — `curl` is not installed in this environment:

```bash
node -e 'fetch("http://localhost:3011/en/card/004fdcbe-6dc9-40ad-9467-b89b72a4a8ca").then(async r=>console.log(r.status,(await r.text()).match(/<title>(.*?)<\/title>/)?.[1]))'
```

Expected: `200` and a real card title (e.g. `Suspend Aggression | Wizcard`), not an error page.

- [ ] **Step 5: The wire shape — `object` is gone, real fields remain**

```bash
node -e '
fetch("http://localhost:3011/api/scryfall/cards/collection",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({identifiers:[{id:"004fdcbe-6dc9-40ad-9467-b89b72a4a8ca"}]})
}).then(r=>r.json()).then(d=>{
  const c=d.data?.[0]??{};
  console.log("object:",c.object,"| name:",c.name,"| set:",c.set,
              "| num:",c.collector_number,"| img:",!!c.image_uris,"| rarity:",c.rarity);
});'
```

Expected: `object: undefined` (the fabricated key is gone) while `name`, `set`, `collector_number`, `image_uris`, `rarity` are all still populated. If any of those real fields is missing, the assembler dropped something it should not have — stop and report.

- [ ] **Step 6: Scryfall fallback still resolves**

Post an identifier that is NOT in the catalog (e.g. `{ "name": "Black Lotus" }`, or an arbitrary non-catalog print id) to the same route and confirm it still returns a card via the Scryfall fallback (or lands in `not_found` for a genuinely bogus id, without a 500).

- [ ] **Step 7: No runtime errors**

```bash
grep -inE "TypeError|ReferenceError|Cannot read|is not a function|Unhandled" /tmp/wave-b-dev.log | grep -viE "punycode|deprecat"
```

Expected: no output. Stop the dev server when done.

- [ ] **Step 8: Update the ledger**

Append a Wave B section to `.superpowers/sdd/progress.md`: base and per-task commits, the assembler fields that stopped being fabricated, the final `as unknown as` count, the runtime evidence from Steps 4–7, and the note that the prints subsystem remains deliberately on `ScryfallCard`.

---

## Self-Review

**Spec coverage:**

- Spec §1 (`rowsToScryfallCard` → `rowsToCard`, fabrication removed, casts dropped) → Task 1. ✓
- Spec §2 (catalog-db returns `Card`) → Task 2. ✓
- Spec §3 (card/source returns `Card` / `ScryfallList<Card>`) → Task 3. ✓
- Spec §4 (client `getCardCollection`) → Task 4. ✓
- Spec "out of scope" (prints subsystem, scryfall types, CustomCard base, network buffers) → Global Constraints, restated in Tasks 1/4. ✓
- Spec invariant "verify no client reads `.object`" → Task 5 Step 5 checks it on the wire. ✓
- Spec verification (tsc, eslint, cast count, runtime incl. fallback) → Task 5. ✓
- Spec's `layout` ambiguity → RESOLVED in Global Constraints and Task 1 Step 3: `Card.layout` is required, so it alone keeps `?? 'normal'`. ✓

**Placeholder scan:** none. Every code step carries the actual code; the two judgement points (whether a row type needs a narrow `as` cast for `colors`/`image_status`/`legalities`, and which imports become unused) are stated with their decision rule and their prohibition (`as`, never `as unknown as`).

**Type consistency:** `rowsToCard` is named identically in Tasks 1 and 2 and in Task 5's grep. `buildFaces` returns `CardFace[] | undefined` in Task 1 and is not referenced elsewhere. `ScryfallList<Card>` is used consistently in Tasks 3 and 4. `Card.layout` required is stated once in Global Constraints and applied once in Task 1. The row interfaces are explicitly declared unchanged in Task 1, so Task 2's untouched bodies still compile.
