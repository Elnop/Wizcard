/** Shared RFC 4180 CSV utilities used by collection import/export adapters. */

/** RFC 4180 character-by-character CSV parser. Returns all fields for every row. */
// eslint-disable-next-line sonarjs/cognitive-complexity -- character-level state machine, complexity is inherent to RFC 4180 parsing
export function parseCSVRows(text: string): string[][] {
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

/** Maps each trimmed header name to its column index. */
export function buildHeaderIndex(headerRow: string[]): Record<string, number> {
	const idx: Record<string, number> = {};
	for (let i = 0; i < headerRow.length; i++) {
		idx[headerRow[i].trim()] = i;
	}
	return idx;
}

/** Reads a field by header name, returning a trimmed string ('' when absent). */
export function get(fields: string[], idx: Record<string, number>, key: string): string {
	const i = idx[key];
	return i !== undefined && i < fields.length ? fields[i].trim() : '';
}

/** Escapes a single CSV field per RFC 4180 (always quoted, inner quotes doubled). */
export function quoteField(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}
