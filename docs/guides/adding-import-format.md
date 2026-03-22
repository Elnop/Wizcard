# Adding a New Import Format

This guide walks through adding a new collection import format (e.g. a CSV export from another tool).

## Overview

An import format consists of two things:

1. An **`ImportFormatDescriptor`** — metadata + detection function
2. A **`FormatParser`** — function that parses raw text into `ParsedImportRow[]`

## Step 1: Create the format file

Create `src/lib/import/formats/myformat.ts`:

```typescript
import type { ImportFormatDescriptor, ParsedImportResult, FormatParser } from '../types';

export const myFormatDescriptor: ImportFormatDescriptor = {
	id: 'myformat',
	label: 'My Format',
	fileExtensions: ['.csv'], // or ['.txt'], etc.

	// Returns a confidence score 0–1 based on text content
	detect(text: string): number {
		// Look for a distinctive header or pattern
		if (text.startsWith('Name,Set,Collector Number,My Column')) return 0.9;
		if (text.includes('MyFormatMarker')) return 0.6;
		return 0;
	},
};

export const parseMyFormat: FormatParser = (text: string): ParsedImportResult => {
	const rows: ParsedImportRow[] = [];
	const parseErrors: string[] = [];

	// Parse text into ParsedImportRow[]
	// ...

	// Build Scryfall identifiers from parsed rows
	const identifiers: ScryfallCardIdentifier[] = rows.map((row) => ({
		set: row.set,
		collector_number: row.collectorNumber,
	}));

	return { rows, parseErrors, identifiers };
};
```

## Step 2: Add the format ID to the union type

In `src/lib/import/types.ts`, add your format ID:

```typescript
export type ImportFormatId = 'moxfield' | 'mtga' | 'myformat';
```

## Step 3: Register the format

In `src/lib/import/formats/index.ts`:

```typescript
import { parseMyFormat, myFormatDescriptor } from './myformat';

export const FORMAT_REGISTRY: ImportFormatDescriptor[] = [
	moxfieldDescriptor,
	mtgaDescriptor,
	myFormatDescriptor, // ← add here
];

const PARSERS: Record<ImportFormatId, FormatParser> = {
	moxfield: parseMoxfield,
	mtga: parseMTGA,
	myformat: parseMyFormat, // ← add here
};
```

## Step 4: Verify detection

Test that your `detect()` function scores correctly against sample data. The detection result is chosen by highest score — make sure your format's signature is distinctive enough to not conflict with existing formats.

```typescript
import { detectFormat } from '@/lib/import/detect';

const result = detectFormat(sampleText, 'export.csv');
console.log(result.scores);
// Should show: { moxfield: 0.05, mtga: 0.0, myformat: 0.9 }
```

## ParsedImportRow Reference

Your parser should produce `ParsedImportRow` objects. All fields except `name`, `set`, `collectorNumber`, and `quantity` are optional — leave them undefined if the format doesn't provide them.

```typescript
interface ParsedImportRow {
	name: string; // card name
	set: string; // set code (e.g. "m21")
	collectorNumber: string; // collector number (e.g. "145")
	quantity: number; // number of copies
	foil?: '' | 'foil' | 'etched';
	condition?: string; // will be normalized (NM/LP/MP/HP/DMG or full name)
	language?: string;
	purchasePrice?: string;
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}
```

## Scryfall Identifier Strategy

Use `set` + `collector_number` identifiers for precise matching:

```typescript
{ set: row.set, collector_number: row.collectorNumber }
```

If the format only provides a name, use:

```typescript
{
	name: row.name;
}
```

Name-only matching will use Scryfall's default printing, which may not match the user's actual card edition.
