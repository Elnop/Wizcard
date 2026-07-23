// Resolve ONE print in the requested language, DB-first. Goes through
// getCardCollection → fetcher → the DB-first /api/scryfall/cards/collection route
// (single identifier). Client-safe: no card-source / server import. Returns null when
// neither the DB nor the Scryfall fallback resolves it. Replaces the old two-step
// "resolve English then re-fetch in lang" pattern — the language is in the identifier.

import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export async function getLocalizedPrint(
	set: string,
	collectorNumber: string,
	lang: string,
	signal?: AbortSignal
): Promise<ScryfallCard | null> {
	const list = await getCardCollection([{ set, collector_number: collectorNumber, lang }], signal);
	return list.data[0] ?? null;
}
