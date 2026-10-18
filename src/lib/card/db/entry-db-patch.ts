import type { CardEntry } from '@/types/cards';
import { normalizeCondition } from '@/lib/card/db/cardRow';

/** `card_entries` columns a bulk update may write. */
export type DbPatch = Partial<{
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
	wishlist: boolean;
	owner_id: string | null;
	scryfall_id: string;
}>;

/** Column values of an entry, in the shape `updateEntry` already writes. */
function columns(e: CardEntry) {
	return {
		is_foil: e.isFoil ?? null,
		foil_type: e.foilType ?? null,
		condition: normalizeCondition(e.condition),
		language: e.language ?? null,
		purchase_price: e.purchasePrice ?? null,
		for_trade: e.forTrade ?? null,
		alter: e.alter ?? null,
		proxy: e.proxy ?? null,
		tags: e.tags ?? null,
		deck_id: e.deckId ?? null,
		wishlist: e.wishlist ?? false,
	};
}

/**
 * The columns that differ between two versions of the same row. `owner_id` and
 * `scryfall_id` are not part of `CardEntry`'s editable state: callers that change
 * them add them to the patch explicitly.
 */
export function entryDbPatch(before: CardEntry, after: CardEntry): DbPatch {
	const a = columns(before);
	const b = columns(after);
	const patch: Record<string, unknown> = {};
	for (const key of Object.keys(b) as Array<keyof typeof b>) {
		if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) patch[key] = b[key];
	}
	return patch as DbPatch;
}

export function isEmptyDbPatch(patch: DbPatch): boolean {
	return Object.keys(patch).length === 0;
}
