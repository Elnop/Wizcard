import type { MoxfieldRow, MoxfieldFoilType } from './types';
import { parseCSVRows, buildHeaderIndex, get } from '@/lib/csv/rfc4180';

function parseFoilType(
	fields: string[],
	idx: Record<string, number>,
	havesFormat: boolean
): MoxfieldFoilType {
	if (havesFormat) {
		const rawEtched = get(fields, idx, 'Etched').toLowerCase();
		const rawFoil = get(fields, idx, 'Foil').toLowerCase();
		if (rawEtched === 'etched') return 'etched';
		if (rawFoil === 'foil') return 'foil';
		return '';
	}
	const rawFoil = get(fields, idx, 'Foil').toLowerCase();
	if (rawFoil === 'foil') return 'foil';
	if (rawFoil === 'etched') return 'etched';
	return '';
}

function parseRowFields(
	fields: string[],
	idx: Record<string, number>,
	lineNum: number,
	havesFormat: boolean
): MoxfieldRow | { error: string } {
	const rawCount = get(fields, idx, 'Count');
	const count = parseInt(rawCount, 10);
	if (!rawCount || isNaN(count) || count <= 0) {
		return { error: `Row ${lineNum + 1}: invalid Count "${rawCount}"` };
	}
	const edition = get(fields, idx, 'Edition');
	if (!edition) return { error: `Row ${lineNum + 1}: missing Edition` };
	const collectorNumber = get(fields, idx, 'Collector Number');
	if (!collectorNumber) return { error: `Row ${lineNum + 1}: missing Collector Number` };

	const rawTags = get(fields, idx, 'Tags') || get(fields, idx, 'Tag');
	const tags = rawTags
		? rawTags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean)
		: [];

	return {
		count,
		tradelistCount: parseInt(get(fields, idx, 'Tradelist Count'), 10) || 0,
		name: get(fields, idx, 'Name'),
		edition,
		// Empty stays empty — an absent column must not become a default value.
		condition: get(fields, idx, 'Condition'),
		language: get(fields, idx, 'Language'),
		foil: parseFoilType(fields, idx, havesFormat),
		tags,
		collectorNumber,
		alter: get(fields, idx, 'Alter').toLowerCase() === 'true',
		proxy: get(fields, idx, 'Proxy').toLowerCase() === 'true',
		purchasePrice: get(fields, idx, 'Purchase Price'),
	};
}

/** Detect whether the CSV uses the "Haves" format (has "Etched" column) vs "Collection" format */
function isHavesFormat(idx: Record<string, number>): boolean {
	return 'Etched' in idx;
}

export function parseMoxfieldCSV(csvText: string): {
	rows: MoxfieldRow[];
	parseErrors: string[];
} {
	const allRows = parseCSVRows(csvText);
	const parseErrors: string[] = [];
	const rows: MoxfieldRow[] = [];

	if (allRows.length === 0) {
		parseErrors.push('CSV file is empty');
		return { rows, parseErrors };
	}

	const headerRow = allRows[0];
	const idx = buildHeaderIndex(headerRow);
	const havesFormat = isHavesFormat(idx);

	for (let lineNum = 1; lineNum < allRows.length; lineNum++) {
		const fields = allRows[lineNum];
		if (fields.length === 1 && fields[0] === '') continue;

		const parsed = parseRowFields(fields, idx, lineNum, havesFormat);
		if ('error' in parsed) {
			parseErrors.push(parsed.error);
		} else {
			rows.push(parsed);
		}
	}

	return { rows, parseErrors };
}
