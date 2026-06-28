import type { CardEntry, CardCondition } from '@/types/cards';
import { SCRYFALL_CODE_TO_LANGUAGE, MTG_LANGUAGES } from '@/lib/mtg/languages';
import type { MtgLanguage } from '@/lib/mtg/languages';

/**
 * Shape of a `public.cards` row. `owner_id` is nullable because deck cards may
 * not carry an owner; `wishlist` is optional because deck-card queries don't
 * select it. All three persistence layers (collection, wishlist, deck) read
 * through this same shape.
 */
export type CardDbRow = {
	id: string;
	owner_id?: string | null;
	scryfall_id: string;
	date_added: string;
	is_foil: boolean | null;
	foil_type: string | null;
	condition: string | null;
	language: string | null;
	purchase_price: string | null;
	for_trade: boolean | null;
	alter: boolean | null;
	proxy: boolean | null;
	tags: string[] | null;
	deck_id: string | null;
	wishlist?: boolean;
};

const CONDITION_MAP: Record<string, CardCondition> = {
	'near mint': 'NM',
	mint: 'NM',
	'lightly played': 'LP',
	'slightly played': 'LP',
	'moderately played': 'MP',
	'heavily played': 'HP',
	damaged: 'DMG',
	poor: 'DMG',
};

const VALID_CONDITIONS = new Set<CardCondition>(['NM', 'LP', 'MP', 'HP', 'DMG']);

/** Map a stored/imported condition string to a canonical `CardCondition`, or null. */
export function normalizeCondition(condition: string | undefined): CardCondition | null {
	if (!condition) return null;
	if (VALID_CONDITIONS.has(condition as CardCondition)) return condition as CardCondition;
	return CONDITION_MAP[condition.toLowerCase()] ?? null;
}

const VALID_LANGUAGES = new Set<MtgLanguage>(MTG_LANGUAGES);

/** Map a stored/Scryfall language code to a canonical `MtgLanguage`, or undefined. */
export function normalizeLanguage(raw: string | undefined): MtgLanguage | undefined {
	if (!raw) return undefined;
	if (VALID_LANGUAGES.has(raw as MtgLanguage)) return raw as MtgLanguage;
	return SCRYFALL_CODE_TO_LANGUAGE[raw] ?? undefined;
}

/** Build a `CardEntry` from a DB row. Condition and language are normalized. */
export function rowToCardEntry(row: CardDbRow, opts?: { includeOwnerId?: boolean }): CardEntry {
	const entry: CardEntry = {
		rowId: row.id,
		dateAdded: row.date_added,
		isFoil: row.is_foil ?? undefined,
		foilType: (row.foil_type as CardEntry['foilType']) ?? undefined,
		condition: normalizeCondition(row.condition ?? undefined) ?? undefined,
		language: normalizeLanguage(row.language ?? undefined),
		purchasePrice: row.purchase_price ?? undefined,
		forTrade: row.for_trade ?? undefined,
		alter: row.alter ?? undefined,
		proxy: row.proxy ?? undefined,
		tags: row.tags ?? undefined,
		deckId: row.deck_id ?? undefined,
		// `wishlist` is optional on the row (deck-card queries select it via `*`).
		// Propagating it lets a deck card know it is also wishlisted (same row).
		wishlist: row.wishlist ?? undefined,
	};
	if (opts?.includeOwnerId) {
		entry.ownerId = row.owner_id ?? undefined;
	}
	return entry;
}

/**
 * Common insert/update payload for a card. The table-specific column
 * `owner_id` is added by the caller; `deck_id` and `wishlist` are included
 * here (and `deck_id` may be overridden by the caller). Condition is normalized.
 */
export function cardEntryToRow(scryfallId: string, entry: CardEntry) {
	return {
		id: entry.rowId,
		scryfall_id: scryfallId,
		date_added: entry.dateAdded,
		is_foil: entry.isFoil ?? null,
		foil_type: entry.foilType ?? null,
		condition: normalizeCondition(entry.condition),
		language: entry.language ?? null,
		purchase_price: entry.purchasePrice ?? null,
		for_trade: entry.forTrade ?? null,
		alter: entry.alter ?? null,
		proxy: entry.proxy ?? null,
		tags: entry.tags ?? null,
		deck_id: entry.deckId ?? null,
		wishlist: entry.wishlist ?? false,
	};
}
