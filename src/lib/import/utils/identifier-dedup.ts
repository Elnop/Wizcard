import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { PendingCard } from '@/lib/import/types';
import { LANGUAGE_TO_SCRYFALL_CODE } from '@/lib/mtg/languages';

/**
 * Normalizes a collector number for stable key comparison.
 * Strips leading zeros from the numeric prefix while preserving non-numeric suffixes.
 * "006" → "6", "006a" → "6a", "M006" → "m006" (non-numeric prefix kept as-is).
 */
function normalizeCollectorNumber(cn: string): string {
	const lower = cn.toLowerCase();
	// Find the first run of digits and strip its leading zeros
	const start = lower.search(/\d/);
	if (start === -1) return lower;
	const end = lower.slice(start).search(/\D/);
	const digitsEnd = end === -1 ? lower.length : start + end;
	const normalized = parseInt(lower.slice(start, digitsEnd), 10).toString();
	return lower.slice(0, start) + normalized + lower.slice(digitsEnd);
}

/**
 * Builds a stable string key for a Scryfall card identifier.
 * Priority: set+collector_number > name+set > name-only.
 */
export function buildIdentifierKey(id: ScryfallCardIdentifier): string {
	// Exact-id identifiers (e.g. a Moxfield import) are unique per print on their
	// own — keying them by name would collapse the whole deck into one card.
	if (id.id) return `id:${id.id.toLowerCase()}`;
	if (id.oracle_id) return `oracle:${id.oracle_id.toLowerCase()}`;
	if ('set' in id && 'collector_number' in id && id.set && id.collector_number) {
		const base = `${id.set.toLowerCase()}/${normalizeCollectorNumber(id.collector_number)}`;
		return id.lang && id.lang !== 'en' ? `${base}/${id.lang}` : base;
	}
	if ('set' in id && id.set) {
		return `name:${(id.name ?? '').toLowerCase()}/set:${id.set.toLowerCase()}`;
	}
	return `name:${(id.name ?? '').toLowerCase()}`;
}

/** Builds a Scryfall identifier from a PendingCard. */
export function buildPendingIdentifier(card: PendingCard): ScryfallCardIdentifier {
	const langCode = card.language
		? (LANGUAGE_TO_SCRYFALL_CODE[card.language] ?? undefined)
		: undefined;
	const lang = langCode && langCode !== 'en' ? langCode : undefined;
	if (card.set && card.collectorNumber) {
		return { set: card.set, collector_number: card.collectorNumber, ...(lang ? { lang } : {}) };
	}
	if (card.set) {
		return { name: card.name, set: card.set };
	}
	return { name: card.name };
}

/** Deduplicates PendingCard[] into a minimal set of Scryfall identifiers for batch fetch. */
export function buildFetchIdentifiers(cards: PendingCard[]): ScryfallCardIdentifier[] {
	const seen = new Map<string, ScryfallCardIdentifier>();
	for (const card of cards) {
		const id = buildPendingIdentifier(card);
		const key = buildIdentifierKey(id);
		if (!seen.has(key)) seen.set(key, id);
	}
	return Array.from(seen.values());
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
