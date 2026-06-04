import type { Card } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { getDeckZone } from '@/types/decks';
import { isBasicLand } from '@/lib/deck/utils/format-rules';
import type { DeckPdfExportOptions } from '@/app/decks/[id]/components/DeckPdfExportModal/DeckPdfExportModal';

export function filterCardsForPdf(cards: Card[], options: DeckPdfExportOptions): Card[] {
	return cards.filter((card) => {
		const zone = getDeckZone(card.entry.tags);
		if (!options.zones.includes(zone)) return false;
		if (options.ignoreOwned && card.entry.ownerId != null) return false;
		if (options.ignoreBasicLands && isBasicLand(card as unknown as ScryfallCard)) return false;
		return true;
	});
}
