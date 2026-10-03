import { getCard } from '@/lib/scryfall/store/cards-store';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import type { CardCopy, CardEntry } from '@/types/cards';

/** Every entry as a full CardCopy — for exports/PDF, which need all cards at once. */
export async function loadCardCopies(
	entries: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<CardCopy[]> {
	const missing = [...new Set(entries.map((e) => e.scryfallId))].filter((id) => !getCard(id));
	if (missing.length > 0) await resolveCardsByScryfallIds(missing);
	const out: CardCopy[] = [];
	for (const { scryfallId, entry } of entries) {
		const card = getCard(scryfallId);
		if (card) out.push({ ...card, entry });
	}
	return out;
}
