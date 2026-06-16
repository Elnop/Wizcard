import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '@/app/decks/[id]/useDeckDetail';

// Zones exportées, dans l'ordre du standard MTGA, avec leur en-tête de section.
// Les tokens sont volontairement absents (générés automatiquement, non gérés par
// les outils cibles).
const EXPORT_SECTIONS: { zone: DeckZone; header: string }[] = [
	{ zone: 'commander', header: 'Commander' },
	{ zone: 'mainboard', header: 'Deck' },
	{ zone: 'sideboard', header: 'Sideboard' },
	{ zone: 'maybeboard', header: 'Maybeboard' },
];

function cardKey(card: ResolvedDeckCard): string {
	return card.oracle_id ?? card.id;
}

// Ligne MTGA/MTGO : "{qty} {name} ({SET}) {collector}" ou "{qty} {name}" si set/collector
// manquant. Inverse exact de parseMtgaCardLine.
function formatLine(qty: number, card: ResolvedDeckCard): string {
	const set = card.set;
	const collector = card.collector_number;
	if (set && collector) {
		return `${qty} ${card.name} (${set.toUpperCase()}) ${collector}`;
	}
	return `${qty} ${card.name}`;
}

function serializeZone(cards: ResolvedDeckCard[]): string[] {
	// Regroupe par carte en préservant l'ordre de première apparition.
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
 * Sérialise un deck en decklist texte au format MTGA/MTGO.
 * Sections : Commander, Deck, Sideboard, Maybeboard (zones vides omises),
 * séparées par une ligne vide. Tokens exclus. Retourne '' si aucune carte.
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
