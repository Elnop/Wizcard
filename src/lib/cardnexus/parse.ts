import type { CardNexusRow } from './types';
import { normalizeCardNexusFinish } from './mappings';
import { parseCSVRows, buildHeaderIndex, get } from '@/lib/csv/rfc4180';

// A Print Number like "223/264" carries the set total — Scryfall uses just "223".
function cleanPrintNumber(raw: string): string {
	const slash = raw.indexOf('/');
	return slash >= 0 ? raw.slice(0, slash).trim() : raw.trim();
}

function parseQuantity(raw: string): number {
	const n = parseInt(raw, 10);
	return !raw || isNaN(n) || n <= 0 ? 1 : n;
}

function parseRowFields(
	fields: string[],
	idx: Record<string, number>,
	lineNum: number
): CardNexusRow | { error: string } {
	const name = get(fields, idx, 'name');
	const printNumber = cleanPrintNumber(get(fields, idx, 'printNumber'));

	// At least one identifier is required.
	if (!name && !printNumber) {
		return { error: `Row ${lineNum + 1}: no identifier (name / printNumber)` };
	}

	const finish = normalizeCardNexusFinish(get(fields, idx, 'finish'));

	return {
		name,
		printNumber,
		variant: get(fields, idx, 'variant'),
		quantity: parseQuantity(get(fields, idx, 'totalQtyOwned')),
		expansion: get(fields, idx, 'expansion'),
		finish: finish.foilType ?? '',
		condition: get(fields, idx, 'condition'),
		language: get(fields, idx, 'language'),
		price: get(fields, idx, 'price'),
	};
}

export function parseCardNexusCSV(csvText: string): {
	rows: CardNexusRow[];
	parseErrors: string[];
} {
	const allRows = parseCSVRows(csvText);
	const parseErrors: string[] = [];
	const rows: CardNexusRow[] = [];

	if (allRows.length === 0) {
		parseErrors.push('CSV file is empty');
		return { rows, parseErrors };
	}

	const idx = buildHeaderIndex(allRows[0]);

	for (let lineNum = 1; lineNum < allRows.length; lineNum++) {
		const fields = allRows[lineNum];
		if (fields.length === 1 && fields[0] === '') continue;

		const parsed = parseRowFields(fields, idx, lineNum);
		if ('error' in parsed) {
			parseErrors.push(parsed.error);
		} else {
			rows.push(parsed);
		}
	}

	return { rows, parseErrors };
}
