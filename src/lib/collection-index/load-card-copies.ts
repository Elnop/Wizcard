import { getCard } from '@/lib/scryfall/store/cards-store';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import type { CardCopy, CardEntry } from '@/types/cards';

export interface LoadCardCopiesResult {
	copies: CardCopy[];
	/** Entries whose card could not be resolved — silently dropped from `copies`. */
	missing: number;
}

/** Every entry as a full CardCopy — for exports/PDF, which need all cards at once. */
export async function loadCardCopies(
	entries: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<LoadCardCopiesResult> {
	const unresolvedIds = [...new Set(entries.map((e) => e.scryfallId))].filter((id) => !getCard(id));
	if (unresolvedIds.length > 0) await resolveCardsByScryfallIds(unresolvedIds);
	const copies: CardCopy[] = [];
	let missing = 0;
	for (const { scryfallId, entry } of entries) {
		const card = getCard(scryfallId);
		if (card) copies.push({ ...card, entry });
		else missing++;
	}
	if (missing > 0) console.warn(`[loadCardCopies] ${missing} card(s) could not be resolved`);
	return { copies, missing };
}
