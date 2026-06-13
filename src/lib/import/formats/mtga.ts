import type { ParsedImportResult, PendingCard, ImportFormatDescriptor } from '../types';

const IGNORED_LINES = new Set(['deck', 'sideboard', 'commander', 'companion']);

// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_FULL = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\d+[a-z]?)$/;
// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_SET_ONLY = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)$/;
// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_NAME_ONLY = /^(\d+)\s+(.+)$/;

export function parseMTGA(text: string): ParsedImportResult {
	const lines = text.split(/\r?\n/);
	const cards: PendingCard[] = [];
	const parseErrors: string[] = [];

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
			const card: PendingCard = { name, set, collectorNumber };
			for (let q = 0; q < quantity; q++) cards.push(card);
			continue;
		}

		match = RE_SET_ONLY.exec(line);
		if (match) {
			const quantity = parseInt(match[1], 10);
			const name = match[2];
			const set = match[3].toLowerCase();
			const card: PendingCard = { name, set, collectorNumber: '' };
			for (let q = 0; q < quantity; q++) cards.push(card);
			continue;
		}

		match = RE_NAME_ONLY.exec(line);
		if (match) {
			const quantity = parseInt(match[1], 10);
			const name = match[2];
			const card: PendingCard = { name, set: '', collectorNumber: '' };
			for (let q = 0; q < quantity; q++) cards.push(card);
			continue;
		}

		parseErrors.push(`Line ${i + 1}: unrecognized format "${line}"`);
	}

	return { cards, parseErrors };
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
