import type { Card } from '@/types/card';
import { MOXFIELD_CSV_HEADERS } from './types';

function quoteField(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function formatDate(iso?: string): string {
	if (!iso) return new Date().toISOString().replace('T', ' ').substring(0, 19);
	return iso.replace('T', ' ').substring(0, 19);
}

export function serializeToMoxfieldCSV(cards: Card[]): string {
	const header = MOXFIELD_CSV_HEADERS.map(quoteField).join(',');

	const dataRows = cards.map((card) => {
		const foil = card.isFoil ? 'foil' : '';
		const tags = (card.tags ?? []).join(',');
		const condition = card.condition ?? 'Near Mint';

		return [
			quoteField(String(card.quantity ?? 1)),
			quoteField('0'),
			quoteField(card.name),
			quoteField(card.set),
			quoteField(condition),
			quoteField(card.lang ?? 'English'),
			quoteField(foil),
			quoteField(tags),
			quoteField(formatDate(card.dateAdded)),
			quoteField(card.collector_number),
			quoteField(''),
			quoteField(''),
			quoteField(''),
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
