import type { CollectionStack, StackMeta } from '@/types/card';
import { createClient } from './client';

const CONDITION_MAP: Record<string, string> = {
	'near mint': 'NM',
	mint: 'NM',
	'lightly played': 'LP',
	'slightly played': 'LP',
	'moderately played': 'MP',
	'heavily played': 'HP',
	damaged: 'DMG',
	poor: 'DMG',
};

const VALID_CONDITIONS = new Set(['NM', 'LP', 'MP', 'HP', 'DMG']);

function normalizeCondition(condition: string | undefined): string | null {
	if (!condition) return null;
	if (VALID_CONDITIONS.has(condition)) return condition;
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

function rowToMeta(row: DbRow): StackMeta {
	return {
		dateAdded: row.date_added,
		isFoil: row.is_foil ?? undefined,
		foilType: (row.foil_type as StackMeta['foilType']) ?? undefined,
		condition: row.condition ?? undefined,
		language: row.language ?? undefined,
		purchasePrice: row.purchase_price ?? undefined,
		forTrade: row.for_trade ?? undefined,
		alter: row.alter ?? undefined,
		proxy: row.proxy ?? undefined,
		tags: row.tags ?? undefined,
	};
}

const PAGE_SIZE = 1000;

export async function fetchCollection(userId: string): Promise<CollectionStack[]> {
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

	// Group rows by scryfall_id into CollectionStack
	// P1-B: Use the most recently added row's meta instead of the first arbitrary row
	const stackMap = new Map<string, CollectionStack>();
	for (const row of allRows) {
		const existing = stackMap.get(row.scryfall_id);
		if (existing) {
			existing.count += 1;
			existing.rowIds.push(row.id);
			// Replace meta if this row is more recent
			if (row.date_added > existing.meta.dateAdded) {
				existing.meta = rowToMeta(row);
			}
		} else {
			stackMap.set(row.scryfall_id, {
				scryfallId: row.scryfall_id,
				count: 1,
				meta: rowToMeta(row),
				rowIds: [row.id],
			});
		}
	}

	return Array.from(stackMap.values());
}

export async function insertEntry(
	userId: string,
	rowId: string,
	scryfallId: string,
	meta: StackMeta
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert({
		id: rowId,
		owner_id: userId,
		scryfall_id: scryfallId,
		date_added: meta.dateAdded,
		is_foil: meta.isFoil ?? null,
		foil_type: meta.foilType ?? null,
		condition: normalizeCondition(meta.condition),
		language: meta.language ?? null,
		purchase_price: meta.purchasePrice ?? null,
		for_trade: meta.forTrade ?? null,
		alter: meta.alter ?? null,
		proxy: meta.proxy ?? null,
		tags: meta.tags ?? null,
	});

	if (error) {
		throw new Error(`[collection] insertEntry error: ${error.message}`);
	}
}

export async function insertEntries(
	userId: string,
	rows: Array<{ rowId: string; scryfallId: string; meta: StackMeta }>
): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert(
		rows.map((r) => ({
			id: r.rowId,
			owner_id: userId,
			scryfall_id: r.scryfallId,
			date_added: r.meta.dateAdded,
			is_foil: r.meta.isFoil ?? null,
			foil_type: r.meta.foilType ?? null,
			condition: normalizeCondition(r.meta.condition),
			language: r.meta.language ?? null,
			purchase_price: r.meta.purchasePrice ?? null,
			for_trade: r.meta.forTrade ?? null,
			alter: r.meta.alter ?? null,
			proxy: r.meta.proxy ?? null,
			tags: r.meta.tags ?? null,
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

export async function updateEntries(
	userId: string,
	rowIds: string[],
	meta: StackMeta
): Promise<void> {
	if (rowIds.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.update({
			date_added: meta.dateAdded,
			is_foil: meta.isFoil ?? null,
			foil_type: meta.foilType ?? null,
			condition: normalizeCondition(meta.condition),
			language: meta.language ?? null,
			purchase_price: meta.purchasePrice ?? null,
			for_trade: meta.forTrade ?? null,
			alter: meta.alter ?? null,
			proxy: meta.proxy ?? null,
			tags: meta.tags ?? null,
		})
		.eq('owner_id', userId)
		.in('id', rowIds);

	if (error) {
		throw new Error(`[collection] updateEntries error: ${error.message}`);
	}
}
