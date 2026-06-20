// CardNexus CSV column headers (export order — matches CardNexus' own export).
// Reference: a real CardNexus collection export.
export const CARDNEXUS_CSV_HEADERS = [
	'totalQtyOwned',
	'name',
	'printNumber',
	'finish',
	'variant',
	'expansion',
	'game',
	'condition',
	'language',
	'price',
] as const;

export type CardNexusFinish = '' | 'foil' | 'etched';

export interface CardNexusRow {
	quantity: number;
	name: string;
	printNumber: string;
	finish: CardNexusFinish;
	variant: string;
	expansion: string; // set NAME (e.g. "Marvel Super Heroes"), not a set code
	condition: string;
	language: string;
	price: string;
}
