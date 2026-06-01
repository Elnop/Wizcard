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

The mapping between DB columns and TypeScript fields is handled in `src/lib/collection/db/collection.ts` (`rowToEntry` function).

---

## localStorage Format

**Key:** `wizcard-collection`

**Current canonical format:**

```typescript
Record<rowId, { scryfallId: string; entry: CardEntry }>;
```

A legacy migration path exists in `useCollection.ts` for older formats. All new writes must use the format above.

**Other localStorage keys:**

- `wizcard-sync-queue` — `SyncOp[]` — pending Supabase sync operations
- `wizcard-signed-in` — presence flag; cleared on logout to wipe local collection state

---

## MPC Custom Cards

MPC proxy cards are sourced from the community via [mpcfill.com](https://mpcfill.com) and stored in two Supabase tables populated by the ingestion script (`scripts/ingest-mpc-cards.ts`).

### `public.custom_card_sources`

| Column            | Type        | Notes                                         |
| ----------------- | ----------- | --------------------------------------------- |
| `id`              | text (PK)   | `mpcfill:{source.key}` — stable provider key  |
| `name`            | text        | Display name                                  |
| `description`     | text        | Optional description from mpcfill             |
| `provider`        | text        | Always `'mpcfill'` for now                    |
| `external_link`   | text        | Original mpcfill source URL                   |
| `drive_folder_id` | text        | Google Drive folder ID (for re-sync)          |
| `tags`            | text[]      | `['mpcfill', source.key]`                     |
| `card_count`      | int         | Denormalized count, updated after each ingest |
| `last_synced_at`  | timestamptz | Timestamp of last successful ingestion        |
| `created_at`      | timestamptz |                                               |

RLS: public SELECT, service_role only for writes.

### `public.custom_cards`

| Column               | Type        | Notes                                                     |
| -------------------- | ----------- | --------------------------------------------------------- |
| `id`                 | text (PK)   | `mpc:{drive_file_id}`                                     |
| `source_id`          | text (FK)   | → `custom_card_sources.id` (cascade delete)               |
| `name`               | text        | Normalized name (known suffixes stripped)                 |
| `raw_name`           | text        | Original filename from Drive                              |
| `image_storage_path` | text        | Path in Storage bucket: `{source_id}/{file_id}.{ext}`     |
| `image_drive_url`    | text        | Drive thumbnail fallback (`thumbnail?id=...&sz=w400`)     |
| `artist`             | text        | Optional, extracted from filename when available          |
| `tags`               | text[]      | `['custom:mpc', 'mpc-source:{source_id}']`                |
| `is_public`          | bool        | `true` for all community cards                            |
| `created_by`         | uuid (FK)   | NULL for ingested cards; user ID for future user cards    |
| `created_at`         | timestamptz |                                                           |
| `oracle_id`          | text        | Scryfall oracle_id if card was matched (exact name)       |
| `enriched_at`        | timestamptz | Set when Scryfall match succeeded; NULL = not yet matched |

RLS: public SELECT (where `is_public = true`), service_role only for writes.

**Indexes:** `custom_cards_source_id_idx` (source_id), `custom_cards_name_idx` (name), `custom_cards_oracle_id_idx` (oracle_id, partial where not null).

**Storage bucket:** `custom-cards` (public read). Images served at:
`{SUPABASE_URL}/storage/v1/object/public/custom-cards/{image_storage_path}`

### MpcCard type (`src/lib/mpc/types.ts`)

```typescript
interface MpcCard {
	id: string; // bare Drive file ID (without mpc: prefix)
	name: string; // normalized
	sourceId: string; // = custom_card_sources.id
	imageUrl: string; // Storage URL, or Drive thumbnail fallback
	isCustom: true;
	oracleId?: string; // Scryfall oracle_id if matched, undefined otherwise
}
```

When added to the collection, MPC cards are stored in `public.cards` like any other card with `proxy=true` and `tags=['custom:mpc', 'mpc-source:{sourceId}']`. The `scryfall_id` field holds the synthetic ID `mpc:{drive_file_id}` generated by `toSyntheticScryfallCard()`.
