# Custom Card Modal & Filters — Design Spec

**Date:** 2026-06-04
**Status:** Approved

---

## Context

The app currently stores rich metadata for custom cards (tags, variants, set_code, collector_number, language, card_type, source) but none of it surfaces in the UI. The card detail modal and filter system both assume pure Scryfall data. Custom cards are silently converted to synthetic `ScryfallCard` objects via `toSyntheticScryfallCard()`, losing all their native metadata.

This feature has two goals:

1. **Modal** — expose all custom card metadata in the detail modal, with full Scryfall data shown first when the card has been Scryfall-enriched
2. **Filters** — add `card_type` and `language` as generic filters (applicable to both Scryfall and custom cards), plus MPC `tags` as a custom-only filter in the existing `FilterModal`

---

## Architecture — Type System

### `CustomCard` type

Follows the same pattern as `Card = ScryfallCard & { entry: CardEntry }`:
all Scryfall fields are present but optional (`Partial<ScryfallCard>`), with a mandatory
`custom` sub-object for custom-specific metadata — mirroring how `entry` holds
physical copy metadata on `Card`.

```typescript
// src/lib/mpc/types.ts

export type CustomCard = Partial<ScryfallCard> & {
	object: 'custom_card'; // discriminant (vs ScryfallCard.object === 'card')
	id: string; // 'mpc:{drive_file_id}'
	name: string;
	custom: CustomCardMeta;
};

export interface CustomCardMeta {
	source_id: string | null;
	source_name: string;
	source_type: CardSourceType; // 'mpc_ingested' | 'user_created'
	card_type: CardType; // 'card' | 'token' | 'cardback'
	image_url: string;
	lang: string | null; // ISO-639-1
	tags: string[]; // MPC bracket tags
	variants: string[]; // parenthesis variants
	set_code: string | null;
	collector_number: string | null;
	is_public: boolean;
	raw_name: string; // original filename
}
```

### Union type update

```typescript
// src/types/cards.ts
export type Card = (ScryfallCard | CustomCard) & { entry: CardEntry };
```

### Narrowing helper

```typescript
// src/lib/mpc/types.ts
export function isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard {
	return card.object === 'custom_card';
}
```

### Adapter update

`toSyntheticScryfallCard()` in `src/lib/mpc/adapter.ts` is **replaced** by
`toCustomCard(card: MpcCard, source: MpcSource): CustomCard` — no more synthetic
Scryfall pollution. The hooks `useCustomCards` and `useMpcPrints` are updated to
return `CustomCard[]` instead of `ScryfallCard[]`.

The DB query in `src/lib/supabase/custom-cards.ts` is extended to also select
`tags`, `variants`, `set_code`, `collector_number`, `raw_name` so that
`CustomCardMeta` is fully populated.

---

## Feature 1 — Card Detail Modal

**Files:** `src/lib/card/components/CardModal/CardModal.tsx`,
`src/lib/card/components/CardModal/CardDetailSection.tsx`

### Rendering logic

```
card.object === 'custom_card'
  ├── card has Scryfall fields (type_line, oracle_text present)
  │     → render existing Scryfall block (unchanged)
  │       + <CustomCardSection card={card} />
  └── card has no Scryfall fields
        → render <CustomCardSection card={card} /> only
```

### `CustomCardSection` component

New component at `src/lib/card/components/CardModal/CustomCardSection.tsx`.

Displays (all conditional on value being non-null/non-empty):

| Field                                         | Display                              |
| --------------------------------------------- | ------------------------------------ |
| `custom.source_name`                          | Label "Source" + value               |
| `custom.source_type`                          | Badge: "MPC" or "User Created"       |
| `custom.card_type`                            | Badge: "Token" / "Cardback" / "Card" |
| `custom.lang`                                 | Label "Language" + ISO code          |
| `custom.set_code` + `custom.collector_number` | "LTC #357" style                     |
| `custom.tags`                                 | Row of chips                         |
| `custom.variants`                             | Row of chips                         |
| `custom.raw_name`                             | Collapsible "filename" detail        |

### `CardImage` update

`src/lib/card/components/CardImage/CardImage.tsx` — add narrowing:

```typescript
const imageUrl = isCustomCard(card) ? card.custom.image_url : card.image_uris?.normal;
```

---

## Feature 2 — Generic Filters (language + card_type)

**Files:** `src/app/collection/utils/filterCollectionCards.ts`,
`src/lib/search/components/FilterModal/FilterModal.tsx`,
`src/app/search/useSearchFiltersFromUrl.ts`

### Type additions

```typescript
// src/app/collection/types.ts (or wherever CollectionFilters lives)
cardTypeFilter: 'all' | CardType; // 'all' | 'card' | 'token' | 'cardback'
languageFilter: string | null; // extends existing language filter or replaces it
```

### Normalizer helper

```typescript
function getCardType(card: ScryfallCard | CustomCard): CardType {
	if (isCustomCard(card)) return card.custom.card_type;
	// Scryfall: derive from layout
	if (card.layout === 'token' || card.layout === 'double_faced_token') return 'token';
	return 'card';
}

function getCardLang(card: ScryfallCard | CustomCard): string | null {
	if (isCustomCard(card)) return card.custom.lang;
	return card.lang ?? null;
}
```

### FilterModal UI

- New "Card Type" select in the main filter section: All / Card / Token / Cardback
- "Language" filter already exists for collection — ensure it applies to both card types using `getCardLang()`

---

## Feature 3 — MPC Tags Filter (custom-only)

**Files:** `src/lib/search/components/FilterModal/FilterModal.tsx`,
`src/lib/search/components/filters/` (new component),
`src/app/collection/utils/filterCollectionCards.ts`

### Type addition

```typescript
mpcTagsFilter: string[];   // empty = no filter
```

### UI

New `MpcTagsFilter` component at
`src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx`.

- Shown conditionally in `FilterModal` when at least one `CustomCard` is present in the current card set
- Dynamically computes available tags from `cards.filter(isCustomCard).flatMap(c => c.custom.tags)` — deduped, sorted
- Multi-select checkboxes
- Filter logic: card passes if `mpcTagsFilter.length === 0 || mpcTagsFilter.every(t => card.custom.tags.includes(t))`

---

## Data Flow Summary

```
custom_cards DB row (with tags, variants, set_code, collector_number, raw_name)
  ↓ src/lib/supabase/custom-cards.ts (extended SELECT)
MpcCard (extended with tags, variants, setCode, collectorNumber, rawName)
  ↓ toCustomCard() in src/lib/mpc/adapter.ts
CustomCard { object: 'custom_card', custom: CustomCardMeta, ...Partial<ScryfallCard> }
  ↓ useCustomCards() / useMpcPrints()
CustomCard[] → Card[] (with entry) → FilterModal + CardModal
```

---

## Verification

1. **Type check:** `npm run check` — no TypeScript errors with new union type
2. **Modal — unenriched custom card:** open modal on a card with no Scryfall data → only `CustomCardSection` renders, all meta fields visible
3. **Modal — enriched custom card:** open modal on a card with `oracle_id` → Scryfall block + `CustomCardSection` both render
4. **Filter — card_type:** set filter to "Token" → only token cards visible (Scryfall tokens via layout + custom tokens via `custom.card_type`)
5. **Filter — language:** set filter to "JP" → only JP cards visible across both types
6. **Filter — MPC tags:** filter section appears when custom cards are present; selecting "Extended Art" hides non-tagged cards; section hidden when no custom cards
7. **CardImage:** custom card image loads from `custom.image_url` without errors
