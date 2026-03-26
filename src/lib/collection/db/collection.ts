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
	};
}

const PAGE_SIZE = 1000;

// Returns one { scryfallId, entry } per physical copy — Scryfall data is fetched separately
export async function fetchCollection(
	userId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const supabase = createClient();
	const allRows: DbRow[] = [];
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from('cards')
			.select('*')
			.eq('owner_id', userId)
			.range(from, from + PAGE_SIZE - 1);

		if (error) {
			console.error('[collection] fetchCollection error:', error);
			return [];
		}

		allRows.push(...(data as DbRow[]));
		if (data.length < PAGE_SIZE) break;
		from += PAGE_SIZE;
	}

	return allRows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToEntry(row) }));
}

export async function insertEntry(
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
	});

	if (error) {
		throw new Error(`[collection] insertEntry error: ${error.message}`);
	}
}

export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert(
		rows.map((r) => ({
			id: r.entry.rowId,
			owner_id: userId,
			scryfall_id: r.scryfallId,
			date_added: r.entry.dateAdded,
			is_foil: r.entry.isFoil ?? null,
			foil_type: r.entry.foilType ?? null,
			condition: normalizeCondition(r.entry.condition),
			language: r.entry.language ?? null,
			purchase_price: r.entry.purchasePrice ?? null,
			for_trade: r.entry.forTrade ?? null,
			alter: r.entry.alter ?? null,
			proxy: r.entry.proxy ?? null,
			tags: r.entry.tags ?? null,
		}))
	);

	if (error) {
		throw new Error(`[collection] insertEntries error: ${error.message}`);
	}
}

export async function deleteEntryById(userId: string, rowId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('owner_id', userId).eq('id', rowId);

	if (error) {
		throw new Error(`[collection] deleteEntryById error: ${error.message}`);
	}
}

export async function updateEntry(userId: string, rowId: string, entry: CardEntry): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.update({
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
		})
		.eq('owner_id', userId)
		.eq('id', rowId);

	if (error) {
		throw new Error(`[collection] updateEntry error: ${error.message}`);
	}
}
