import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { ParsedImportResult, ParsedImportRow, ImportFormatDescriptor } from '../utils/types';

const IGNORED_LINES = new Set(['deck', 'sideboard', 'commander', 'companion']);

// 4 Lightning Bolt (M11) 149
const RE_FULL = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\d+[a-z]?)$/;
// 4 Lightning Bolt (M11)
const RE_SET_ONLY = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)$/;
// 4 Lightning Bolt
const RE_NAME_ONLY = /^(\d+)\s+(.+)$/;

export function parseMTGA(text: string): ParsedImportResult {
	const lines = text.split(/\r?\n/);
	const rows: ParsedImportRow[] = [];
	const parseErrors: string[] = [];
	const identifiers: ScryfallCardIdentifier[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		if (IGNORED_LINES.has(line.toLowerCase())) continue;

		let match = RE_FULL.exec(line);
		if (match) {
			const quantity = parseInt(match[1], 10);
			const name = match[2];
			const set = match[3].toLowerCase();
			const collectorNumber = match[4];
			rows.push({ name, set, collectorNumber, quantity });
			identifiers.push({ set, collector_number: collectorNumber });
			continue;
		}

		match = RE_SET_ONLY.exec(line);
		if (match) {
			const quantity = parseInt(match[1], 10);
			const name = match[2];
			const set = match[3].toLowerCase();
			rows.push({ name, set, collectorNumber: '', quantity });
			identifiers.push({ name, set });
			continue;
		}

		match = RE_NAME_ONLY.exec(line);
		if (match) {
			const quantity = parseInt(match[1], 10);
			const name = match[2];
			rows.push({ name, set: '', collectorNumber: '', quantity });
			identifiers.push({ name });
			continue;
		}

		parseErrors.push(`Line ${i + 1}: unrecognized format "${line}"`);
	}

	return { rows, parseErrors, identifiers };
}

export const mtgaDescriptor: ImportFormatDescriptor = {
	id: 'mtga',
	label: 'MTGA / MTGO Text',
	fileExtensions: ['.txt', '.dec'],
	detect(text: string): number {
		const lines = text
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter((l) => l && !IGNORED_LINES.has(l.toLowerCase()));
		if (lines.length === 0) return 0;

		let matchCount = 0;
		for (const line of lines) {
			if (RE_FULL.test(line) || RE_SET_ONLY.test(line) || RE_NAME_ONLY.test(line)) {
				matchCount++;
			}
		}
		const ratio = matchCount / lines.length;
		return ratio > 0.6 ? 0.9 : ratio;
	},
};
