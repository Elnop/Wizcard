import type { ParsedImportResult, PendingCard, ImportFormatDescriptor } from '../types';
import { parseMtgaCardLine, isMtgaCardLine } from './mtgaCardLine';

const IGNORED_LINES = new Set(['deck', 'sideboard', 'commander', 'companion']);

// Header row emitted by full MTGA/Moxfield/Deckbox CSV-style exports, e.g.
// "Quantity Name Edition (code) Collector's number Foil". Not a card.
function isHeaderLine(line: string): boolean {
	return /^quantity\b/i.test(line) && /\bname\b/i.test(line);
}

export function parseMTGA(text: string): ParsedImportResult {
	const lines = text.split(/\r?\n/);
	const cards: PendingCard[] = [];
	const parseErrors: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		if (IGNORED_LINES.has(line.toLowerCase())) continue;
		if (isHeaderLine(line)) continue;

		const parsed = parseMtgaCardLine(line);
		if (parsed) {
			const card: PendingCard = {
				name: parsed.name,
				set: parsed.set,
				collectorNumber: parsed.collectorNumber,
				...(parsed.foil ? { isFoil: true } : {}),
			};
			for (let q = 0; q < parsed.quantity; q++) cards.push(card);
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
			.filter((l) => l && !IGNORED_LINES.has(l.toLowerCase()) && !isHeaderLine(l));
		if (lines.length === 0) return 0;

		let matchCount = 0;
		for (const line of lines) {
			if (isMtgaCardLine(line)) {
				matchCount++;
			}
		}
		const ratio = matchCount / lines.length;
		return ratio > 0.6 ? 0.9 : ratio;
	},
};
