import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '@/app/decks/[id]/useDeckDetail';

// Exported zones, in MTGA standard order, with their section header.
// Tokens are deliberately absent (auto-generated, not handled by the target tools).
const EXPORT_SECTIONS: { zone: DeckZone; header: string }[] = [
	{ zone: 'commander', header: 'Commander' },
	{ zone: 'mainboard', header: 'Deck' },
	{ zone: 'sideboard', header: 'Sideboard' },
	// Moxfield calls the maybeboard "Considering"; this header round-trips into
	// Moxfield (and our own parser maps "considering" back to maybeboard).
	{ zone: 'maybeboard', header: 'Considering' },
];

function cardKey(card: ResolvedDeckCard): string {
	return card.oracle_id ?? card.id;
}

// MTGA/MTGO line: "{qty} {name} ({SET}) {collector}", or "{qty} {name}" when
// set/collector is missing. Exact inverse of parseMtgaCardLine.
function formatLine(qty: number, card: ResolvedDeckCard): string {
	const set = card.set;
	const collector = card.collector_number;
	if (set && collector) {
		return `${qty} ${card.name} (${set.toUpperCase()}) ${collector}`;
	}
	return `${qty} ${card.name}`;
}

function serializeZone(cards: ResolvedDeckCard[]): string[] {
	// Group by card, preserving first-appearance order.
	const order: string[] = [];
	const byKey = new Map<string, { count: number; card: ResolvedDeckCard }>();
	for (const card of cards) {
		const key = cardKey(card);
		const existing = byKey.get(key);
		if (existing) {
			existing.count++;
		} else {
			byKey.set(key, { count: 1, card });
			order.push(key);
		}
	}
	return order.map((key) => {
		const { count, card } = byKey.get(key)!;
		return formatLine(count, card);
	});
}

/**
 * Serialize a deck into an MTGA/MTGO text decklist.
 * Sections: Commander, Deck, Sideboard, Maybeboard (empty zones omitted),
 * separated by a blank line. Tokens excluded. Returns '' if there are no cards.
 */
export function serializeDecklist(cardsByZone: Record<DeckZone, ResolvedDeckCard[]>): string {
	const blocks: string[] = [];
	for (const { zone, header } of EXPORT_SECTIONS) {
		const cards = cardsByZone[zone];
		if (!cards || cards.length === 0) continue;
		const lines = serializeZone(cards);
		blocks.push([header, ...lines].join('\n'));
	}
	return blocks.join('\n\n');
}
