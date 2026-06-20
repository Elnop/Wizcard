import type { Card } from '@/types/cards';
import { CARDNEXUS_CSV_HEADERS } from './types';
import {
	cardConditionToCardNexus,
	foilToCardNexusFinish,
	cardNexusFinishLabel,
	mtgLanguageToCardNexus,
} from './mappings';
import { quoteField } from '@/lib/csv/rfc4180';

// `set_name` exists on ScryfallCard but not on CustomCard.
function setName(card: Card): string {
	return 'set_name' in card && card.set_name ? card.set_name : (card.set ?? '');
}

// Accepts one Card per physical copy — each becomes one CSV row.
export function serializeToCardNexusCSV(cards: Card[]): string {
	const header = CARDNEXUS_CSV_HEADERS.map(quoteField).join(',');

	const dataRows = cards.map((card) => {
		const { entry } = card;
		const finish = foilToCardNexusFinish(entry.isFoil, entry.foilType);
		const language = mtgLanguageToCardNexus(entry.language ?? undefined);
		const variant = (entry.tags ?? []).join(' ');

		// Column order must match CARDNEXUS_CSV_HEADERS:
		// totalQtyOwned, name, printNumber, finish, variant, expansion, game,
		// condition, language, price
		return [
			quoteField('1'),
			quoteField(card.name),
			quoteField(card.collector_number ?? ''),
			quoteField(cardNexusFinishLabel(finish)),
			quoteField(variant),
			quoteField(setName(card)),
			quoteField('Magic: The Gathering'),
			quoteField(cardConditionToCardNexus(entry.condition)),
			quoteField(language),
			quoteField(entry.purchasePrice ?? ''),
		].join(',');
	});

	return [header, ...dataRows].join('\r\n');
}
