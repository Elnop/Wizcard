# Data Model

## Core Types (`src/types/cards.ts`)

### CardCondition

```typescript
type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
```

| Value | Meaning           |
| ----- | ----------------- |
| NM    | Near Mint         |
| LP    | Lightly Played    |
| MP    | Moderately Played |
| HP    | Heavily Played    |
| DMG   | Damaged           |

### CardEntry

Represents a single physical copy of a card in the collection.

```typescript
interface CardEntry {
	rowId: string; // UUID — unique per physical copy (= cards.id in DB)
	dateAdded: string; // ISO 8601 timestamp
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	condition?: CardCondition;
	language?: MtgLanguage; // see src/lib/mtg/languages.ts
	purchasePrice?: string; // free-form string (e.g. "4.99")
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}
```

### Card

A card in the user's collection — Scryfall print data merged with per-copy metadata.

```typescript
type Card = ScryfallCard & { entry: CardEntry };
```

`ScryfallCard` provides all card details from the Scryfall API (name, image URIs, mana cost, set, oracle text, prices, etc.). See `src/lib/scryfall/types/scryfall.ts` for the full type.

### CardStack

All copies of a card with the same `oracle_id`, potentially across different editions.

```typescript
interface CardStack {
	oracleId: string; // stable grouping key (Scryfall oracle_id)
	name: string; // display name (from the first card in the stack)
	cards: Card[]; // all physical copies — may be different printings
}
```

**Why `oracleId` and not `scryfallId`?** A user may own 3 copies of "Lightning Bolt" from different sets (Alpha, 4th Edition, M10). Each has a unique `scryfallId` but the same `oracleId`. Grouping by `oracleId` shows them as one entry in the collection ("Lightning Bolt ×3") rather than three separate entries.

### CollectionStats

```typescript
interface CollectionStats {
	totalCards: number; // sum of all copies
	uniqueCards: number; // number of distinct oracle IDs
	uniqueByEdition: number; // number of distinct scryfall IDs
	setCount: number; // number of distinct sets
	rarityDistribution: Record<string, number>;
	colorDistribution?: Record<string, number>;
	typeDistribution?: Record<string, number>;
}
```

---

## ID Concepts

There are three distinct ID concepts in the codebase. Mixing them up is a common source of bugs.

| Concept      | Where                                          | Meaning                                                 |
| ------------ | ---------------------------------------------- | ------------------------------------------------------- |
| `rowId`      | `CardEntry.rowId`, `cards.id` (DB)             | Unique per physical copy in the collection              |
| `scryfallId` | `ScryfallCard.id`, `cards.scryfall_id` (DB)    | Identifies a specific printing/edition                  |
| `oracleId`   | `ScryfallCard.oracle_id`, `CardStack.oracleId` | Identifies the abstract card (same across all editions) |

---

## Supabase DB Schema

Table: `public.cards`

| Column           | Type        | Notes                      |
| ---------------- | ----------- | -------------------------- |
| `id`             | uuid (PK)   | = `CardEntry.rowId`        |
| `owner_id`       | uuid (FK)   | references `auth.users.id` |
| `scryfall_id`    | text        | Scryfall print UUID        |
| `date_added`     | timestamptz | = `CardEntry.dateAdded`    |
| `is_foil`        | boolean     |                            |
| `foil_type`      | text        | `'foil'` or `'etched'`     |
| `condition`      | text        | NM / LP / MP / HP / DMG    |
| `language`       | text        | `MtgLanguage` value        |
| `purchase_price` | text        | free-form                  |
| `for_trade`      | boolean     |                            |
| `alter`          | boolean     |                            |
| `proxy`          | boolean     |                            |
| `tags`           | text[]      |                            |

RLS policies ensure `auth.uid() = owner_id` for all operations.

The mapping between DB columns and TypeScript fields is handled in `src/lib/supabase/collection.ts` (`rowToEntry` function).

---

## localStorage Format

**Key:** `mtg-snap-collection`

**Current canonical format:**

```typescript
Record<rowId, { scryfallId: string; entry: CardEntry }>;
```

A legacy migration path exists in `useCollection.ts` for older formats. All new writes must use the format above.

**Other localStorage keys:**

- `mtg-snap-sync-queue` — `SyncOp[]` — pending Supabase sync operations
- `mtg-snap-signed-in` — presence flag; cleared on logout to wipe local collection state
