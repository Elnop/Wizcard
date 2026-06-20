import { parseCardNexusCSV } from './parse';
import {
	normalizeCardNexusCondition,
	normalizeCardNexusFinish,
	normalizeCardNexusLanguage,
} from './mappings';
import type { ParsedImportResult, PendingCard, ImportFormatDescriptor } from '@/lib/import/types';

export function parseCardNexus(text: string): ParsedImportResult {
	const { rows, parseErrors } = parseCardNexusCSV(text);

	const cards: PendingCard[] = [];
	for (const row of rows) {
		const finish = normalizeCardNexusFinish(row.finish);
		const card: PendingCard = {
			name: row.name,
			// Expansion is a set NAME, not a code. The pipeline's set-code normalizer
			// resolves names to codes; an unmatched name falls back to name+number.
			set: row.expansion,
			collectorNumber: row.printNumber,
			isFoil: finish.isFoil,
			foilType: finish.foilType,
			condition: normalizeCardNexusCondition(row.condition),
			language: normalizeCardNexusLanguage(row.language),
			purchasePrice: row.price || undefined,
			tags: row.variant ? [row.variant] : undefined,
		};
		for (let i = 0; i < row.quantity; i++) {
			cards.push(card);
		}
	}

	return { cards, parseErrors };
}

export const cardNexusDescriptor: ImportFormatDescriptor = {
	id: 'cardnexus',
	label: 'CardNexus CSV',
	fileExtensions: ['.csv'],
	detect(text: string): number {
		const firstLine = text.split(/\r?\n/)[0] ?? '';
		// CardNexus uses lowercase camelCase headers, distinct from Moxfield
		// (Count / Edition / Collector Number).
		const hasName = /(^|,)"?name"?(,|$)/.test(firstLine);
		const hasCardNexusCol =
			firstLine.includes('printNumber') ||
			firstLine.includes('totalQtyOwned') ||
			firstLine.includes('expansion');
		if (hasName && hasCardNexusCol) return 0.95;
		return 0;
	},
};
