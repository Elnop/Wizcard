import type { DeckZone } from '@/types/decks';

/** Short label shown on a zone badge. */
export const ZONE_ABBREV: Record<DeckZone, string> = {
	mainboard: 'Main',
	sideboard: 'Side',
	maybeboard: 'Maybe',
	commander: 'Cmd',
	tokens: 'Tok',
};

/** Canonical display order for zones. */
const ZONE_ORDER: DeckZone[] = ['mainboard', 'sideboard', 'maybeboard', 'commander', 'tokens'];

/**
 * Return [zone, count] entries from a zone→count map in canonical order,
 * skipping zones with no count.
 */
export function orderZones(byZone: Map<DeckZone, number>): Array<[DeckZone, number]> {
	const result: Array<[DeckZone, number]> = [];
	for (const zone of ZONE_ORDER) {
		const count = byZone.get(zone);
		if (count != null && count > 0) result.push([zone, count]);
	}
	return result;
}
