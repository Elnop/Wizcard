// Export header used when serializing (Format "Collection", full export)
export const MOXFIELD_CSV_HEADERS = [
	'Count',
	'Tradelist Count',
	'Name',
	'Edition',
	'Condition',
	'Language',
	'Foil',
	'Tags',
	'Last Modified',
	'Collector Number',
	'Alter',
	'Proxy',
	'Purchase Price',
] as const;

export type MoxfieldFoilType = '' | 'foil' | 'etched';

export interface MoxfieldRow {
	count: number;
	tradelistCount: number;
	name: string;
	edition: string;
	condition: string;
	language: string;
	foil: MoxfieldFoilType;
	tags: string[];
	collectorNumber: string;
	alter: boolean;
	proxy: boolean;
	purchasePrice: string;
}
