# Import Formats

The import system supports loading an existing card collection from external sources. Supported formats are auto-detected from file content.

## Supported Formats

| Format       | File Extension | Description                                                                |
| ------------ | -------------- | -------------------------------------------------------------------------- |
| Moxfield CSV | `.csv`         | Export from moxfield.com — includes condition, foil, language, price, tags |
| MTGA         | `.txt`         | Arena deck/collection export — minimal metadata (name + quantity only)     |

## Auto-Detection (`src/lib/import/utils/detect.ts`)

Format detection is score-based. Each format descriptor exposes a `detect(text: string): number` function that returns a confidence score between 0 and 1. A file extension match adds +0.1 to the score (capped at 1).

The format with the highest score wins.

```typescript
import { detectFormat } from '@/lib/import/utils/detect';

const result = detectFormat(text, 'collection.csv');
// { formatId: 'moxfield', scores: { moxfield: 0.95, mtga: 0.1 } }
```

## Import Flow

```
File drop / paste text
    ↓
detectFormat(text, fileName)    → formatId
    ↓
getParser(formatId)(text)       → ParsedImportResult
    ↓
Scryfall /cards/collection      → ScryfallCard[] (identifier lookup)
    ↓
importCards()                   → addCard() per card × quantity
    ↓
Collection updated + sync enqueued
```

## ParsedImportRow

The intermediate format produced by all parsers before Scryfall lookup:

```typescript
interface ParsedImportRow {
	name: string;
	set: string; // set code (e.g. "lea", "m21")
	collectorNumber: string;
	quantity: number;
	foil?: '' | 'foil' | 'etched';
	condition?: string; // normalized to CardCondition on import
	language?: string;
	purchasePrice?: string;
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}
```

## Format-Specific Notes

### Moxfield CSV

- Full metadata support: condition, foil type, language, price, trade flag, tags
- Conditions are normalized via `CONDITION_MAP` in `collection.ts` (e.g. `"Near Mint"` → `"NM"`)
- Parser: `src/lib/import/formats/moxfield.ts`

### MTGA

- Minimal metadata: only card name and quantity
- No condition, language, or price information
- Deck list format: `4 Lightning Bolt`
- Parser: `src/lib/import/formats/mtga.ts`

## Format Registry

Formats are registered in `src/lib/import/formats/index.ts`:

```typescript
export const FORMAT_REGISTRY: ImportFormatDescriptor[] = [moxfieldDescriptor, mtgaDescriptor];
```

See [Adding a new import format](guides/adding-import-format.md) to extend this list.
