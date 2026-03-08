import type { MoxfieldRow, MoxfieldFoilType } from './types';

/** RFC 4180 character-by-character CSV parser. Returns all fields for every row. */
function parseCSVRows(text: string): string[][] {
	const rows: string[][] = [];
	const row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				// Peek ahead: doubled quote is an escaped quote
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
				} else {
					// Closing quote
					inQuotes = false;
					i++;
				}
			} else {
				field += ch;
				i++;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
				i++;
			} else if (ch === ',') {
				row.push(field);
				field = '';
				i++;
			} else if (ch === '\r') {
				// CRLF or bare CR
				row.push(field);
				field = '';
				rows.push(row.slice());
				row.length = 0;
				if (text[i + 1] === '\n') i++;
				i++;
			} else if (ch === '\n') {
				row.push(field);
				field = '';
				rows.push(row.slice());
				row.length = 0;
				i++;
			} else {
				field += ch;
				i++;
			}
		}
	}

	// Last field / row (no trailing newline)
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	return rows;
}

function buildHeaderIndex(headerRow: string[]): Record<string, number> {
	const idx: Record<string, number> = {};
	for (let i = 0; i < headerRow.length; i++) {
		idx[headerRow[i].trim()] = i;
	}
	return idx;
}

function get(fields: string[], idx: Record<string, number>, key: string): string {
	const i = idx[key];
	return i !== undefined && i < fields.length ? fields[i].trim() : '';
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

		// Skip blank lines
		if (fields.length === 1 && fields[0] === '') continue;

		const rawCount = get(fields, idx, 'Count');
		const count = parseInt(rawCount, 10);
		if (!rawCount || isNaN(count) || count <= 0) {
			parseErrors.push(`Row ${lineNum + 1}: invalid Count "${rawCount}"`);
			continue;
		}

		const edition = get(fields, idx, 'Edition');
		if (!edition) {
			parseErrors.push(`Row ${lineNum + 1}: missing Edition`);
			continue;
		}

		const collectorNumber = get(fields, idx, 'Collector Number');
		if (!collectorNumber) {
			parseErrors.push(`Row ${lineNum + 1}: missing Collector Number`);
			continue;
		}

		let foil: MoxfieldFoilType;
		if (havesFormat) {
			// Haves format: "Foil" = 'foil'|'', "Etched" = 'etched'|''
			const rawFoil = get(fields, idx, 'Foil').toLowerCase();
			const rawEtched = get(fields, idx, 'Etched').toLowerCase();
			foil = rawEtched === 'etched' ? 'etched' : rawFoil === 'foil' ? 'foil' : '';
		} else {
			// Collection format: "Foil" = 'foil'|'etched'|''
			const rawFoil = get(fields, idx, 'Foil').toLowerCase();
			foil = rawFoil === 'foil' ? 'foil' : rawFoil === 'etched' ? 'etched' : '';
		}

		// "Tags" (Collection) or "Tag" (Haves)
		const rawTags = get(fields, idx, 'Tags') || get(fields, idx, 'Tag');
		const tags = rawTags
			? rawTags
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean)
			: [];

		rows.push({
			count,
			tradelistCount: parseInt(get(fields, idx, 'Tradelist Count'), 10) || 0,
			name: get(fields, idx, 'Name'),
			edition,
			condition: get(fields, idx, 'Condition') || 'Near Mint',
			language: get(fields, idx, 'Language') || 'English',
			foil,
			tags,
			collectorNumber,
			alter: get(fields, idx, 'Alter').toLowerCase() === 'true',
			proxy: get(fields, idx, 'Proxy').toLowerCase() === 'true',
			purchasePrice: get(fields, idx, 'Purchase Price'),
		});
	}

	return { rows, parseErrors };
}
