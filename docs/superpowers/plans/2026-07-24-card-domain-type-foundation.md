# Card Domain Type Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the existing possessed-copy `Card` type to `CardCopy` (freeing the name `Card`), and define a new flat provider-neutral domain `Card` type + a pure `toCard(scryfall)` adapter — the tested foundation for later migrating the app off `ScryfallCard`.

**Architecture:** Two isolated changes in `@/types/cards.ts` + a new adapter. (1) `Card → CardCopy` rename across ~34 importer files (tsc-verified). (2) A new `Card`/`CardFace`/`CardPart` domain type in `@/types/cards.ts` and `toCard` in `src/lib/card/adapter.ts`. Nothing consumes the new type yet.

**Tech Stack:** TypeScript. No test framework — verify via `tsc` (the definitive check for a type rename) + `npm run check`.

## Global Constraints

- **No test framework** — verify via `npx tsc --noEmit` (the rename's safety net) + `npm run check`. Never write unit tests. (project convention)
- **`npm run check` is RED at baseline** (~51 pre-existing problems). Gate on NO NEW problems. (project memory)
- **Rename ONLY the `Card` type imported from `@/types/cards`** — NOT any other `Card*` identifier (`CardEntry`, `CardStack`, `CardCondition`, `CollectionStats`, `ScryfallCard`, `CustomCard`, `CardModal`, `CardImage`, `CardList`, `CardData`, `AnyCard`'s other members, component/CSS names). (spec — the critical risk)
- **`CardCopy` does not exist yet** (verified — no collision). (spec)
- **Type-only change** — no runtime behavior change; `CardCopy` is structurally identical to the old `Card`. (spec)
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- Modify: `src/types/cards.ts` — rename `Card → CardCopy`; add domain `Card` + `CardFace` + `CardPart`.
- Modify: ~34 importer files (listed in Task 1) — `Card` → `CardCopy` in imports + uses.
- Modify: `src/lib/card/components/CardList/CardList.types.ts` + `src/lib/card/utils/filterCollectionCards.ts` — the `AnyCard` union member.
- Create: `src/lib/card/adapter.ts` — `toCard(scryfall)` pure adapter.

---

## Task 1: Rename `Card → CardCopy`

**Files:**

- Modify: `src/types/cards.ts`
- Modify: the ~34 importers below.

**Interfaces:**

- Produces: `CardCopy` (was `Card`) = `(ScryfallCard | CustomCard) & { entry: CardEntry }`; `CardStack.cards: CardCopy[]`; `AnyCard = ScryfallCard | CardCopy | CustomCard`. The name `Card` is freed.

- [ ] **Step 1: Rename in `src/types/cards.ts`**

```ts
// before
export type Card = (ScryfallCard | CustomCard) & { entry: CardEntry };
export interface CardStack {
	oracleId: string;
	name: string;
	cards: Card[];
}
// after
export type CardCopy = (ScryfallCard | CustomCard) & { entry: CardEntry };
export interface CardStack {
	oracleId: string;
	name: string;
	cards: CardCopy[];
}
```

Leave `CardEntry`, `CardCondition`, `CollectionStats` untouched.

- [ ] **Step 2: Rename in every importer (the `Card` binding from `@/types/cards` only)**

For EACH file below: in its `import … from '@/types/cards'`, rename the `Card` binding to
`CardCopy`, then update every use of that type in the file (`: Card`, `Card[]`, `as Card`,
`<Card>`, `Partial<Card>`, etc.). Do NOT touch `CardEntry`/`CardStack`/other bindings in the
same import, and do NOT touch unrelated `Card*` identifiers.

Files (import shape in parens):

- `src/app/[locale]/collection/lib/ImportModal/hooks/useImportPreviewState.ts` (`{ Card, CardEntry, CardStack }`)
- `src/app/[locale]/collection/ExportMenu/ExportMenu.tsx` (`{ Card }`)
- `src/app/[locale]/decks/[id]/useDeckDetail.ts` (`{ Card }`)
- `src/app/[locale]/decks/[id]/useDeckCardModalProps.tsx` (`{ Card, CardEntry }`)
- `src/app/[locale]/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx` (`{ Card, CardEntry }`)
- `src/app/[locale]/decks/[id]/components/SampleHand/SampleHand.tsx` (`{ Card }`)
- `src/app/[locale]/decks/[id]/components/SampleHand/useSampleHand.ts` (`{ Card }`)
- `src/app/[locale]/users/[userId]/components/ProfileOverview.tsx` (`{ Card, CardStack }`)
- `src/contexts/CardModalProvider.tsx` (`{ Card, CardEntry, CardStack }`)
- `src/types/decks.ts` (`{ Card }`)
- `src/lib/cardnexus/serialize.ts` (`{ Card }`)
- `src/lib/moxfield/serialize.ts` (`{ Card }`)
- `src/lib/collection/hooks/useCollectionCards.ts` (`{ Card, CardStack }`)
- `src/lib/card/ownedCardMenu.ts` (`{ Card, CardStack }`)
- `src/lib/card/deriveCardModalProps.ts` (`{ Card, CardEntry }`)
- `src/lib/card/hooks/useOwnedCardMenuHandlers.ts` (`{ Card, CardStack }`)
- `src/lib/card/utils/group-cards.ts` (`{ Card, CardStack }`)
- `src/lib/card/utils/filterCollectionCards.ts` (`{ Card }`) ← also has the `AnyCard` union (Task 1 Step 3)
- `src/lib/card/components/EditCardModal/EditCardModal.tsx` (`{ Card, CardEntry }`)
- `src/lib/card/components/CardModal/CopyCardOverlay.tsx` (`{ Card }`)
- `src/lib/card/components/CardModal/CardModal.tsx` (`{ Card, CardEntry }`)
- `src/lib/card/components/CardList/CardList.types.ts` (`{ Card }`) ← also has the `AnyCard` union (Task 1 Step 3)
- `src/lib/card/components/DeckBadge/DeckBadge.tsx` (`{ Card }`)
- `src/lib/card/components/PrintList/PrintList.tsx` (`{ Card }`)
- `src/lib/card/components/PrintList/PrintList.types.ts` (`{ Card }`)
- `src/lib/card/components/OwnershipBadge/copyBadgeState.ts` (`{ Card }`)
- `src/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal.tsx` (`{ Card }`)
- `src/lib/deck/utils/sample-hand.ts` (`{ Card }`)
- `src/lib/import/types.ts` (`{ CardCondition, Card }`)
- `src/lib/import/hooks/useImportPreviewFetch.ts` (`{ Card, CardEntry }`)
- `src/lib/import/components/ImportPreview/ImportPreview.tsx` (`{ Card, CardEntry }`)
- `src/lib/import/components/ImportPreview/useImportPreviewEdit.ts` (`{ Card, CardEntry }`)
- `src/lib/pdf/filterCardsForPdf.ts` (`{ Card }`)
- `src/components/PdfSettingsModal/PdfSettingsModal.tsx` (`{ Card }`)

> **Implementer note:** work file-by-file. A reliable per-file recipe: (a) change the import
> binding `Card` → `CardCopy`; (b) within that file, replace type-position `Card` with
> `CardCopy` — but ONLY where it refers to the imported type (watch for `CardEntry`,
> `CardStack`, `ScryfallCard`, JSX component names, string literals, CSS — leave those). tsc
> catches a missed rename (a use of the now-undefined `Card`) AND an over-rename (a `CardCopy`
> where some other `Card` was meant would usually still error). Some files also re-export or
> alias — handle those the same way. `src/types/decks.ts` imports `Card` and may re-export it
> via `DeckCard`-like types; rename the binding and its uses there too.

- [ ] **Step 3: Update the `AnyCard` unions**

In `src/lib/card/components/CardList/CardList.types.ts` and
`src/lib/card/utils/filterCollectionCards.ts`:

```ts
// before
export type AnyCard = ScryfallCard | Card | CustomCard;
// after
export type AnyCard = ScryfallCard | CardCopy | CustomCard;
```

(These files also appear in the Task 1 Step 2 list — the `AnyCard` edit is the same rename.)

- [ ] **Step 4: Type-check — the definitive rename verification**

Run: `npx tsc --noEmit`
Expected: **clean**. Any error `Cannot find name 'Card'` / `'Card' is not exported` means a
missed rename — fix it. This is the authoritative check that the rename is complete and
correct (a type rename that compiles is complete).
Then: `grep -rn "\bCard\b" src/ | grep "from '@/types/cards'"` → should show `CardCopy` (or
other bindings), no bare `Card` imported from that module.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint` on a sample of changed files (or `npm run check`) → no NEW problems.

```bash
git add -A
git commit -m "$(printf 'refactor(types): rename possessed-copy Card -> CardCopy\n\nFrees the name Card for the incoming provider-neutral domain type. CardCopy =\n(ScryfallCard | CustomCard) & { entry: CardEntry } (unchanged shape); CardStack\nand the AnyCard unions updated. Type-only, no runtime change; tsc-verified.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Define the domain `Card` type

**Files:**

- Modify: `src/types/cards.ts`

**Interfaces:**

- Produces: `Card` (domain, flat, provider-neutral), `CardFace`, `CardPart` — exported from `@/types/cards`. No consumer yet.

- [ ] **Step 1: Add the domain types**

Add to `src/types/cards.ts` (the `Card` name is now free after Task 1):

```ts
// A face of a multi-face card (transform/split/adventure/DFC). Mirrors what the DB
// assembler produces per face.
export interface CardFace {
	name?: string;
	type_line?: string;
	oracle_text?: string;
	mana_cost?: string;
	colors?: string[];
	power?: string;
	toughness?: string;
	loyalty?: string;
	artist?: string;
	illustration_id?: string;
	image_uris?: { small: string; normal: string; large: string };
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
}

// A related card (token / meld part / meld result / combo piece).
export interface CardPart {
	id: string; // the related print id
	component: string; // token | meld_part | meld_result | combo_piece
	name: string;
	type_line: string;
}

// Provider-neutral Magic card (a specific print). Flat — same field names the app reads
// today — so migrating consumers off ScryfallCard is a near-drop-in. Provider-specific
// fields (scryfall_uri, prints_search_uri, uri, rulings_uri, set URIs) and volatile prices
// are intentionally NOT here.
export interface Card {
	// identity
	id: string;
	oracle_id: string;
	name: string;
	lang: string;
	layout: string;
	// gameplay
	type_line?: string;
	oracle_text?: string;
	mana_cost?: string;
	cmc?: number;
	colors?: string[];
	color_identity?: string[];
	keywords?: string[];
	power?: string;
	toughness?: string;
	loyalty?: string;
	defense?: string;
	legalities?: unknown;
	reserved?: boolean;
	edhrec_rank?: number;
	// print
	set: string;
	set_name?: string;
	collector_number: string;
	rarity?: string;
	released_at?: string;
	artist?: string;
	frame?: string;
	border_color?: string;
	image_status?: string;
	image_uris?: { small: string; normal: string; large: string };
	finishes?: string[];
	foil?: boolean;
	nonfoil?: boolean;
	promo?: boolean;
	reprint?: boolean;
	variation?: boolean;
	digital?: boolean;
	// localized
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
	// multi-face + relations
	card_faces?: CardFace[];
	all_parts?: CardPart[];
	// external ids
	multiverse_ids?: number[];
	mtgo_id?: number;
	arena_id?: number;
	tcgplayer_id?: number;
	cardmarket_id?: number;
}
```

`image_uris` deliberately uses the reduced `{small,normal,large}` shape (matching the catalog

- the DB assembler; the app never reads png/art_crop/border_crop on the card path).

* [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean (adding exported interfaces used by nobody yet is safe).
`npx eslint src/types/cards.ts` → no new problems.

- [ ] **Step 3: Commit**

```bash
git add src/types/cards.ts
git commit -m "$(printf 'feat(types): add provider-neutral domain Card (+ CardFace, CardPart)\n\nFlat domain card type in @/types/cards: the ~40 fields the app reads, neutral\nnames, no provider-specific fields (scryfall_uri/prints_search_uri) or prices.\nNo consumer yet — the seam for the ScryfallCard migration waves.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: The `toCard` adapter

**Files:**

- Create: `src/lib/card/adapter.ts`

**Interfaces:**

- Consumes: `ScryfallCard`, `ScryfallCardFace`, `ScryfallRelatedCard` from `@/lib/scryfall/types/scryfall`; `Card`, `CardFace`, `CardPart` from `@/types/cards`.
- Produces: `toCard(scryfall: ScryfallCard): Card` — pure, no consumer yet.

- [ ] **Step 1: Write the adapter**

```ts
// Pure adapter: a raw ScryfallCard (provider form) → the provider-neutral domain Card.
// Modeled on toCustomCard. No I/O, no consumer yet — the seam later migration waves use to
// feed the app domain cards.

import type {
	ScryfallCard,
	ScryfallCardFace,
	ScryfallRelatedCard,
	ScryfallImageUris,
} from '@/lib/scryfall/types/scryfall';
import type { Card, CardFace, CardPart } from '@/types/cards';

function img3(uris: ScryfallImageUris | undefined): Card['image_uris'] {
	return uris ? { small: uris.small, normal: uris.normal, large: uris.large } : undefined;
}

function toFace(f: ScryfallCardFace): CardFace {
	return {
		name: f.name,
		type_line: f.type_line,
		oracle_text: f.oracle_text,
		mana_cost: f.mana_cost,
		colors: f.colors,
		power: f.power,
		toughness: f.toughness,
		loyalty: f.loyalty,
		artist: f.artist,
		illustration_id: f.illustration_id,
		image_uris: img3(f.image_uris),
		printed_name: f.printed_name,
		printed_type_line: f.printed_type_line,
		printed_text: f.printed_text,
	};
}

function toPart(p: ScryfallRelatedCard): CardPart {
	return { id: p.id, component: p.component, name: p.name, type_line: p.type_line };
}

export function toCard(s: ScryfallCard): Card {
	const finishes = s.finishes ?? [];
	return {
		id: s.id,
		oracle_id: s.oracle_id,
		name: s.name,
		lang: s.lang,
		layout: s.layout,
		type_line: s.type_line,
		oracle_text: s.oracle_text,
		mana_cost: s.mana_cost,
		cmc: s.cmc,
		colors: s.colors,
		color_identity: s.color_identity,
		keywords: s.keywords,
		power: s.power,
		toughness: s.toughness,
		loyalty: s.loyalty,
		defense: s.defense,
		legalities: s.legalities,
		reserved: s.reserved,
		edhrec_rank: s.edhrec_rank,
		set: s.set,
		set_name: s.set_name,
		collector_number: s.collector_number,
		rarity: s.rarity,
		released_at: s.released_at,
		artist: s.artist,
		frame: s.frame,
		border_color: s.border_color,
		image_status: s.image_status,
		image_uris: img3(s.image_uris),
		finishes,
		foil: s.foil ?? finishes.includes('foil'),
		nonfoil: s.nonfoil ?? finishes.includes('nonfoil'),
		promo: s.promo,
		reprint: s.reprint,
		variation: s.variation,
		digital: s.digital,
		printed_name: s.printed_name,
		printed_type_line: s.printed_type_line,
		printed_text: s.printed_text,
		card_faces: s.card_faces?.map(toFace),
		all_parts: s.all_parts?.map(toPart),
		multiverse_ids: s.multiverse_ids,
		mtgo_id: s.mtgo_id,
		arena_id: s.arena_id,
		tcgplayer_id: s.tcgplayer_id,
		cardmarket_id: s.cardmarket_id,
	};
}
```

> **Implementer note:** `ScryfallCard`'s `image_uris`/face `image_uris` are the full 6-size
> `ScryfallImageUris`; `img3` narrows to `{small,normal,large}`. If a field's type on
> `ScryfallCard` differs from the domain (e.g. `colors` is `ScryfallColors` = `ScryfallColor[]`,
> assignable to `string[]`), it assigns fine; if tsc complains about a specific field's type,
> narrow/cast minimally at that field (e.g. `colors: s.colors as string[] | undefined`) rather
> than widening the domain type. Report any field that needed a cast.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → clean. `npx eslint src/lib/card/adapter.ts` → clean.

- [ ] **Step 3: Runtime spot-check (throwaway, deleted before commit)**

Write `scripts/tmp-tocard-check.ts` that imports `toCard`, builds it from a minimal
`ScryfallCard`-shaped literal (or fetches one field-complete object), and prints
`card.name`, `card.set`, `card.image_uris`, `card.card_faces?.length`, `card.foil`. Confirm
the mapped fields are present and `foil`/`nonfoil` derive from `finishes`. Delete the script
before committing. (This is a type/shape sanity check — there is no runtime consumer yet.)

- [ ] **Step 4: Commit** (adapter only — throwaway deleted)

```bash
git add src/lib/card/adapter.ts
git commit -m "$(printf 'feat(card): toCard adapter (ScryfallCard -> domain Card)\n\nPure provider adapter mapping a raw ScryfallCard to the neutral domain Card\n(faces + parts included; foil/nonfoil derived from finishes; provider URLs and\nprices dropped). No consumer yet — the seam for the migration waves.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Final check

**Files:** none.

- [ ] **Step 1: Full project check**

Run: `npm run check` → no NEW problems beyond baseline. `npx tsc --noEmit` clean (the rename's authority).

- [ ] **Step 2: Confirm the foundation is inert**

- The new `Card`/`toCard` have no consumers: `grep -rn "toCard\b" src/ | grep -v node_modules` → only `adapter.ts`. The domain `Card` is imported by nobody outside `@/types/cards`/`adapter.ts` yet (migration is later).
- No leftover old-`Card`: `grep -rn "import .*\bCard\b.* from '@/types/cards'" src/ | grep -v CardCopy | grep -v node_modules` → only lines importing the NEW domain `Card` intentionally (none yet) or other bindings (CardEntry/CardStack) — no possessed-copy `Card` import remains.
- App runs unchanged (type-only change): a quick `npm run build` or dev boot succeeds.

- [ ] **Step 3: No commit** (verification only). Sub-project 1c-0 complete.

---

## Self-Review

**Spec coverage:**

- Rename `Card → CardCopy` (types + ~34 importers + AnyCard + CardStack) → Task 1. ✔
- Domain `Card` + `CardFace` + `CardPart` in `@/types/cards.ts` → Task 2. ✔
- `toCard(scryfall)` pure adapter → Task 3. ✔
- Nothing migrated (foundation inert) → Task 4 Step 2. ✔
- Out of scope (112-consumer migration, CardCopy using domain, assembler, prices) → not touched. ✔

**Placeholder scan:** No TBD/TODO. The `<field cast if tsc complains>` guidance in Task 3 is a
real "narrow minimally at the failing field" instruction (with an example), not a placeholder —
the adapter code is complete; only per-field type reconciliation may be needed. The `~34
importers` list is enumerated explicitly (not "etc.").

**Type consistency:** `CardCopy` (Task 1) replaces `Card` everywhere the possessed-copy type
was used; `AnyCard` uses `CardCopy`. The new domain `Card`/`CardFace`/`CardPart` (Task 2) are
what `toCard` (Task 3) returns/builds — field names match between the type and the adapter.
`img3` returns `Card['image_uris']`. tsc is the cross-check for the whole task.
