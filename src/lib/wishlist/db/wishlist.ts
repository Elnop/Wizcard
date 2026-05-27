import type { CardEntry, CardCondition } from '@/types/cards';
import { createClient } from '@/lib/supabase/client';

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

function normalizeCondition(condition: string | undefined): CardCondition | null {
	if (!condition) return null;
	if (VALID_CONDITIONS.has(condition as CardCondition)) return condition as CardCondition;
	return CONDITION_MAP[condition.toLowerCase()] ?? null;
}

type DbRow = {
	id: string;
	owner_id: string;
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
	wishlist: boolean;
};

function rowToEntry(row: DbRow): CardEntry {
	return {
		rowId: row.id,
		dateAdded: row.date_added,
		isFoil: row.is_foil ?? undefined,
		foilType: (row.foil_type as CardEntry['foilType']) ?? undefined,
		condition: normalizeCondition(row.condition ?? undefined) ?? undefined,
		language: (row.language as CardEntry['language']) ?? undefined,
		purchasePrice: row.purchase_price ?? undefined,
		forTrade: row.for_trade ?? undefined,
		alter: row.alter ?? undefined,
		proxy: row.proxy ?? undefined,
		tags: row.tags ?? undefined,
		deckId: row.deck_id ?? undefined,
	};
}

const DB_FETCH_PAGE_SIZE = 1000;

export async function fetchWishlistPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('owner_id', userId)
		.eq('wishlist', true)
		.range(from, from + DB_FETCH_PAGE_SIZE - 1);

	if (error) {
		console.error('[wishlist] fetchWishlistPage error:', error);
		return { rows: [], hasMore: false };
	}

	const rows = (data as DbRow[]).map((row) => ({
		scryfallId: row.scryfall_id,
		entry: rowToEntry(row),
	}));
	return { rows, hasMore: data.length === DB_FETCH_PAGE_SIZE };
}

export async function insertWishlistItem(
	userId: string,
	scryfallId: string,
	entry: CardEntry
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert({
		id: entry.rowId,
		owner_id: userId,
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
		deck_id: null,
		wishlist: true,
	});

	if (error) {
		throw new Error(`[wishlist] insertWishlistItem error: ${error.message}`);
	}
}

export async function deleteWishlistItem(userId: string, rowId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.delete()
		.eq('owner_id', userId)
		.eq('id', rowId)
		.eq('wishlist', true);

	if (error) {
		throw new Error(`[wishlist] deleteWishlistItem error: ${error.message}`);
	}
}
