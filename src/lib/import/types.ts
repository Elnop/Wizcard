import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';

export type ImportFormatId = 'moxfield' | 'mtga';

export interface ImportFormatDescriptor {
	id: ImportFormatId;
	label: string;
	fileExtensions: string[];
	detect: (text: string) => number;
}

export interface ParsedImportRow {
	name: string;
	set: string;
	collectorNumber: string;
	quantity: number;
	foil?: '' | 'foil' | 'etched';
	condition?: string;
	language?: string;
	purchasePrice?: string;
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}

export interface ParsedImportResult {
	rows: ParsedImportRow[];
	parseErrors: string[];
	identifiers: ScryfallCardIdentifier[];
}

export interface ImportResult {
	imported: number;
	notFound: number;
	errors: string[];
}

export type FormatParser = (text: string) => ParsedImportResult;
