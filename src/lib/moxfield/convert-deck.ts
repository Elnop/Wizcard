import type { DeckFormat, DeckZone } from '@/types/decks';
import type { MoxfieldDeckResponse, MoxfieldEntry } from './fetch-deck';

export interface MoxfieldImportData {
	name: string;
	format: DeckFormat | null;
	description: string | null;
	cards: Array<{ scryfallId: string; zone: DeckZone; quantity: number }>;
}

const VALID_FORMATS = new Set<string>([
	'standard',
	'modern',
	'pioneer',
	'legacy',
	'vintage',
	'commander',
	'pauper',
	'draft',
	'limited',
	'oathbreaker',
	'brawl',
]);

function toFormat(raw: string): DeckFormat | null {
	const lower = raw.toLowerCase();
	if (VALID_FORMATS.has(lower)) return lower as DeckFormat;
	return null;
}

function collectEntries(
	board: Record<string, MoxfieldEntry>,
	zone: DeckZone
): Array<{ scryfallId: string; zone: DeckZone; quantity: number }> {
	const result: Array<{ scryfallId: string; zone: DeckZone; quantity: number }> = [];
	for (const entry of Object.values(board)) {
		if (entry.quantity > 0 && entry.card?.scryfall_id) {
			result.push({
				scryfallId: entry.card.scryfall_id,
				zone,
				quantity: entry.quantity,
			});
		}
	}
	return result;
}

export function convertMoxfieldDeck(response: MoxfieldDeckResponse): MoxfieldImportData {
	const cards = [
		...collectEntries(response.mainboard ?? {}, 'mainboard'),
		...collectEntries(response.sideboard ?? {}, 'sideboard'),
		...collectEntries(response.commanders ?? {}, 'commander'),
		...collectEntries(response.companions ?? {}, 'commander'),
		...collectEntries(response.maybeboard ?? {}, 'maybeboard'),
	];

	return {
		name: response.name || 'Imported Deck',
		format: toFormat(response.format ?? ''),
		description: response.description || null,
		cards,
	};
}
