export type DeckFormat =
	| 'standard'
	| 'modern'
	| 'pioneer'
	| 'legacy'
	| 'vintage'
	| 'commander'
	| 'pauper'
	| 'draft'
	| 'limited'
	| 'oathbreaker'
	| 'brawl';

export type DeckZone = 'mainboard' | 'sideboard' | 'maybeboard' | 'commander';

const DECK_ZONE_PREFIX = 'deck:';
const VALID_ZONES: Set<string> = new Set<string>([
	'mainboard',
	'sideboard',
	'maybeboard',
	'commander',
]);

/** Extract the deck zone from a tags array. Returns 'mainboard' if none found. */
export function getDeckZone(tags: string[] | undefined): DeckZone {
	if (!tags) return 'mainboard';
	for (const tag of tags) {
		if (tag.startsWith(DECK_ZONE_PREFIX)) {
			const zone = tag.slice(DECK_ZONE_PREFIX.length);
			if (VALID_ZONES.has(zone)) return zone as DeckZone;
		}
	}
	return 'mainboard';
}

/** Return a new tags array with the deck zone tag set (replaces any existing zone tag). */
export function setDeckZone(tags: string[] | undefined, zone: DeckZone): string[] {
	const filtered = (tags ?? []).filter((t) => !t.startsWith(DECK_ZONE_PREFIX));
	filtered.push(`${DECK_ZONE_PREFIX}${zone}`);
	return filtered;
}

/** Return a new tags array with deck zone tags removed. */
export function removeDeckZoneTags(tags: string[] | undefined): string[] {
	return (tags ?? []).filter((t) => !t.startsWith(DECK_ZONE_PREFIX));
}

export interface DeckMeta {
	id: string;
	name: string;
	format: DeckFormat | null;
	description: string | null;
	createdAt: string;
	updatedAt: string;
}
