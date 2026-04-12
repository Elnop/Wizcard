import { parseMoxfieldCSV } from './parse';
import type { ParsedImportResult, ImportFormatDescriptor } from '@/lib/import/types';

export function parseMoxfield(text: string): ParsedImportResult {
	const { rows, parseErrors } = parseMoxfieldCSV(text);

	const parsedRows = rows.map((row) => ({
		name: row.name,
		set: row.edition,
		collectorNumber: row.collectorNumber,
		quantity: row.count,
		foil: row.foil,
		condition: row.condition,
		language: row.language,
		purchasePrice: row.purchasePrice,
		forTrade: (row.tradelistCount ?? 0) > 0,
		alter: row.alter,
		proxy: row.proxy,
		tags: row.tags,
	}));

	const identifiers = rows.map((row) => ({
		set: row.edition,
		collector_number: row.collectorNumber,
	}));

	return { rows: parsedRows, parseErrors, identifiers };
}

export const moxfieldDescriptor: ImportFormatDescriptor = {
	id: 'moxfield',
	label: 'Moxfield CSV',
	fileExtensions: ['.csv'],
	detect(text: string): number {
		const firstLine = text.split(/\r?\n/)[0] ?? '';
		if (
			firstLine.includes('Count') &&
			firstLine.includes('Edition') &&
			firstLine.includes('Collector Number')
		) {
			return 0.95;
		}
		if (firstLine.includes(',')) return 0.2;
		return 0;
	},
};
