import type { ScryfallCard, ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { deduplicateIdentifiers } from '@/lib/import/utils/identifier-dedup';
import type { DeckImportResult } from '@/lib/import/formats/mtga-deck';

/** A parsed deck row matched to a resolved Scryfall card, ready for bulkAddCardsToDeck. */
export type ResolvedDeckRow = {
	card: ScryfallCard;
	zone: DeckZone;
	quantity: number;
};

export type ResolveDeckListResult = {
	cardsToAdd: ResolvedDeckRow[];
	notFound: string[];
};

/** Fetch resolved Scryfall cards for a list of identifiers (deduped, batched). */
async function fetchResolvedCards(identifiers: ScryfallCardIdentifier[]): Promise<ScryfallCard[]> {
	const deduped = deduplicateIdentifiers(identifiers);

	const results: ScryfallCard[] = [];
	for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
		const batch = deduped.slice(i, i + BATCH_SIZE);
		const response = await getCardCollection(batch);
		results.push(...response.data);
	}

	return results;
}

/**
 * Resolve a parsed deck list against Scryfall and match each parsed row to a
 * concrete card. Shared by ImportDeckModal (create a new deck) and
 * ImportListIntoDeckModal (add to an existing deck).
 *
 * Matching priority per row: set:collectorNumber → name within set → name only.
 */
export async function resolveDeckList(
	parsed: DeckImportResult,
	normalizeSetCodes: (p: DeckImportResult) => DeckImportResult
): Promise<ResolveDeckListResult> {
	const normalized = normalizeSetCodes(parsed);
	const resolved = await fetchResolvedCards(normalized.identifiers);

	const cardMap = new Map<string, ScryfallCard>();
	for (const card of resolved) {
		cardMap.set(`${card.set}:${card.collector_number}`, card);
		cardMap.set(`name:${card.name.toLowerCase()}`, card);
		const slashIdx = card.name.indexOf(' // ');
		if (slashIdx !== -1) {
			cardMap.set(`name:${card.name.slice(0, slashIdx).toLowerCase()}`, card);
		}
	}

	const cardsToAdd: ResolvedDeckRow[] = [];
	const notFound: string[] = [];

	for (const row of normalized.rows) {
		let card =
			row.set && row.collectorNumber ? cardMap.get(`${row.set}:${row.collectorNumber}`) : undefined;
		if (!card && row.set) {
			card = resolved.find(
				(c) =>
					c.set === row.set &&
					(c.name.toLowerCase() === row.name.toLowerCase() ||
						c.name.toLowerCase().startsWith(row.name.toLowerCase() + ' // '))
			);
		}
		if (!card) {
			card = cardMap.get(`name:${row.name.toLowerCase()}`);
		}

		if (card) {
			cardsToAdd.push({ card, zone: row.zone, quantity: row.quantity });
		} else {
			notFound.push(`${row.quantity} ${row.name}`);
		}
	}

	return { cardsToAdd, notFound };
}
