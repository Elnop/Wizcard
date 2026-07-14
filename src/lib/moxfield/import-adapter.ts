import { parseMoxfieldCSV } from './parse';
import { normalizeMoxfieldCondition, normalizeMoxfieldLanguage } from './mappings';
import type { ParsedImportResult, PendingCard, ImportFormatDescriptor } from '@/lib/import/types';

export function parseMoxfield(text: string): ParsedImportResult {
	const { rows, parseErrors } = parseMoxfieldCSV(text);

	const cards: PendingCard[] = [];
	for (const row of rows) {
		const card: PendingCard = {
			name: row.name,
			set: row.edition,
			collectorNumber: row.collectorNumber,
			isFoil: !!row.foil,
			foilType: row.foil || undefined,
			condition: normalizeMoxfieldCondition(row.condition),
			language: normalizeMoxfieldLanguage(row.language),
			purchasePrice: row.purchasePrice,
			forTrade: (row.tradelistCount ?? 0) > 0,
			alter: row.alter,
			proxy: row.proxy,
			tags: row.tags,
		};
		for (let i = 0; i < row.count; i++) {
			cards.push(card);
		}
	}

	return { cards, parseErrors };
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
