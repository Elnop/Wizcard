import type { CardCopy } from '@/types/cards';
import { getDeckZone } from '@/types/decks';
import { isBasicLand } from '@/lib/deck/utils/format-rules';
import type { DeckPdfExportOptions } from '@/lib/pdf/types';

export function filterCardsForPdf(cards: CardCopy[], options: DeckPdfExportOptions): CardCopy[] {
	return cards.filter((card) => {
		const zone = getDeckZone(card.entry.tags);
		if (!options.zones.includes(zone)) return false;
		if (options.ignoreOwned && card.entry.ownerId != null) return false;
		if (options.ignoreBasicLands && isBasicLand(card)) return false;
		return true;
	});
}
