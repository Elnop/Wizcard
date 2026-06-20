import type { CardCondition, Card } from '@/types/cards';
import type { MtgLanguage } from '@/lib/mtg/languages';

export type ImportFormatId = 'moxfield' | 'cardnexus' | 'mtga' | 'delverlens';

export interface ImportFormatDescriptor {
	id: ImportFormatId;
	label: string;
	fileExtensions: string[];
	detect: (text: string) => number;
}

// One physical copy before Scryfall resolution — quantity expanded (N copies = N PendingCard)
export interface PendingCard {
	// Scryfall identification
	name: string;
	set: string;
	collectorNumber: string; // '' when unknown → name-only fallback
	language?: MtgLanguage;

	// Physical attributes (CardEntry fields without rowId/dateAdded)
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	condition?: CardCondition;
	purchasePrice?: string;
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}

export interface ParsedImportResult {
	cards: PendingCard[];
	parseErrors: string[];
}

// Result after Scryfall fetch + resolve, stored in useImport state
export interface ResolvedImportResult {
	resolved: Card[]; // PendingCard matched with their ScryfallCard
	notFound: PendingCard[]; // identifiers Scryfall did not find
}

export interface ImportResult {
	imported: number;
	notFound: number;
	errors: string[];
}

export type FormatParser = (text: string) => ParsedImportResult;

export type BinaryFormatParser = (buffer: ArrayBuffer) => Promise<ParsedImportResult>;

export interface BinaryFormatDescriptor {
	id: ImportFormatId;
	label: string;
	fileExtensions: string[];
}

const BINARY_FORMAT_IDS: Set<ImportFormatId> = new Set(['delverlens']);

export function isBinaryFormat(formatId: ImportFormatId): boolean {
	return BINARY_FORMAT_IDS.has(formatId);
}
