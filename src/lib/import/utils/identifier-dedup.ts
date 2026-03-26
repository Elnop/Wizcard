import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';

/**
 * Builds a stable string key for a Scryfall card identifier.
 * Priority: set+collector_number > name+set > name-only.
 */
export function buildIdentifierKey(id: ScryfallCardIdentifier): string {
	if ('set' in id && 'collector_number' in id && id.set && id.collector_number) {
		return `${id.set.toLowerCase()}/${id.collector_number.toLowerCase()}`;
	}
	if ('set' in id && id.set) {
		return `name:${(id.name ?? '').toLowerCase()}/set:${id.set.toLowerCase()}`;
	}
	return `name:${(id.name ?? '').toLowerCase()}`;
}

/**
 * Deduplicates an array of Scryfall card identifiers.
 * When multiple identifiers map to the same key, only the first is kept.
 */
export function deduplicateIdentifiers(
	identifiers: ScryfallCardIdentifier[]
): ScryfallCardIdentifier[] {
	const seen = new Map<string, ScryfallCardIdentifier>();
	for (const id of identifiers) {
		const key = buildIdentifierKey(id);
		if (!seen.has(key)) {
			seen.set(key, id);
		}
	}
	return Array.from(seen.values());
}
