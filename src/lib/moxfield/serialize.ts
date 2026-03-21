import type { Card } from '@/types/cards';
import { MOXFIELD_CSV_HEADERS } from './types';

function quoteField(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function formatDate(iso?: string): string {
	if (!iso) return new Date().toISOString().replace('T', ' ').substring(0, 19);
	return iso.replace('T', ' ').substring(0, 19);
}

// Accepts one Card per physical copy — each becomes one CSV row
export function serializeToMoxfieldCSV(cards: Card[]): string {
	const header = MOXFIELD_CSV_HEADERS.map(quoteField).join(',');

	const dataRows = cards.map((card) => {
		const { entry } = card;
		const foil = entry.foilType ?? (entry.isFoil ? 'foil' : '');
		const language = entry.language ?? card.lang ?? 'English';
		const tags = (entry.tags ?? []).join(',');
		const condition = entry.condition ?? 'Near Mint';

		return [
			quoteField('1'),
			quoteField(entry.forTrade ? '1' : '0'),
			quoteField(card.name),
			quoteField(card.set),
			quoteField(condition),
			quoteField(language),
			quoteField(foil),
			quoteField(tags),
			quoteField(formatDate(entry.dateAdded)),
			quoteField(card.collector_number),
			quoteField(entry.alter ? 'true' : ''),
			quoteField(entry.proxy ? 'true' : ''),
			quoteField(entry.purchasePrice ?? ''),
		].join(',');
	});

	return [header, ...dataRows].join('\r\n');
}

export function downloadCSV(csvText: string, filename: string): void {
	if (typeof document === 'undefined') return;

	const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
