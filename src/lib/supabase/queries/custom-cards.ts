import { createClient } from '@/lib/supabase/client';
import type { CardSourceType, CardType } from '@/lib/mpc/types';

/**
 * Raw Supabase access for `custom_cards` / `custom_card_sources`. ONLY place
 * that issues these client.from(...) calls. Returns DB rows; domain mapping
 * (row -> MpcCard/MpcSource) and post-query color filtering live in mpc/db.
 *
 * `CardType` is imported as a TYPE only (filter contract); no domain runtime
 * value or logic enters this layer.
 */

export interface CustomCardSourceRow {
	id: string;
	name: string;
	description: string | null;
	drive_folder_id: string | null;
	tags: string[];
}

export interface CustomCardRow {
	id: string;
	source_id: string | null;
	name: string;
	raw_name: string;
	display_name: string | null;
	image_drive_url: string | null;
	image_storage_path: string | null;
	art_storage_path: string | null;
	back_image_storage_path: string | null;
	oracle_id: string | null;
	source_type: CardSourceType;
	is_public: boolean;
	created_by: string | null;
	card_type: CardType;
	language: string | null;
	tags: string[];
	set_code: string | null;
	collector_number: string | null;
	colors: string[] | null;
	color_identity: string[] | null;
	cmc: number | null;
	type_line: string | null;
	mana_cost: string | null;
	oracle_text: string | null;
	rarity: string | null;
	set_name: string | null;
	artist: string | null;
	drive_folder_path: string | null;
	layout: string | null;
	editor_payload: Record<string, unknown> | null;
	updated_at: string;
}

export const CUSTOM_CARD_SOURCE_SELECT = 'id, name, description, drive_folder_id, tags';

export const CUSTOM_CARD_SELECT =
	'id, source_id, name, raw_name, display_name, image_drive_url, image_storage_path, art_storage_path, back_image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, set_code, collector_number, colors, color_identity, cmc, type_line, mana_cost, oracle_text, rarity, set_name, artist, drive_folder_path, layout, editor_payload, updated_at';

export interface CustomCardQueryFilters {
	name?: string;
	colors?: string[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type?: string[];
	set?: string;
	cmc?: string;
	rarities?: string[];
	oracleText?: string;
	mpcTagsMustHave?: string[];
	mpcTagsMustNotHave?: string[];
	oracleId?: string;
	cardTypes?: CardType[];
	order?: string;
	dir?: 'asc' | 'desc' | 'auto';
}

export interface CustomCardRowQuery {
	sourceId?: string | null;
	page: number;
	pageSize: number;
	filters: CustomCardQueryFilters;
}

export async function fetchCustomCardSourceRows(): Promise<CustomCardSourceRow[]> {
	const client = createClient();
	const { data, error } = await client
		.from('custom_card_sources')
		.select(CUSTOM_CARD_SOURCE_SELECT)
		.order('name');
	if (error) throw new Error(`Failed to load custom card sources: ${error.message}`);
	return data as CustomCardSourceRow[];
}

export async function fetchCustomCardSourceRowsWithCounts(): Promise<{
	sources: CustomCardSourceRow[];
	countBySource: Map<string, number>;
}> {
	const client = createClient();
	const [sourcesResult, cardsResult] = await Promise.all([
		client.from('custom_card_sources').select(CUSTOM_CARD_SOURCE_SELECT).order('name'),
		client
			.from('custom_cards')
			.select('source_id')
			.eq('is_public', true)
			.not('oracle_id', 'is', null),
	]);
	if (sourcesResult.error)
		throw new Error(`Failed to load custom card sources: ${sourcesResult.error.message}`);
	if (cardsResult.error)
		throw new Error(`Failed to load custom card counts: ${cardsResult.error.message}`);

	const countBySource = new Map<string, number>();
	for (const row of cardsResult.data as { source_id: string }[]) {
		countBySource.set(row.source_id, (countBySource.get(row.source_id) ?? 0) + 1);
	}
	return { sources: sourcesResult.data as CustomCardSourceRow[], countBySource };
}

/** Batch by-id fetch for hydration of stored custom-card copies. `ids` are
 *  the stored `custom_cards.id` values (prefixed `mpc:<uuid>`). Only public cards
 *  resolve — a private/deleted card is simply absent from the result, mirroring
 *  Scryfall's unresolved-id behavior. */
export async function fetchCustomCardRowsByIds(ids: string[]): Promise<CustomCardRow[]> {
	if (ids.length === 0) return [];
	const client = createClient();
	const { data, error } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.in('id', ids)
		.eq('is_public', true);
	if (error) throw new Error(`Failed to load custom cards by ids: ${error.message}`);
	return data as CustomCardRow[];
}

function parseCmcClause(raw: string): { op: string; value: number } | null {
	if (!raw) return null;
	const match = raw.match(/^(>=|<=|>|<|:)?(\d+)$/);
	if (!match) return null;
	return { op: match[1] ?? ':', value: parseInt(match[2], 10) };
}

export async function queryCustomCardRows(
	query: CustomCardRowQuery
): Promise<{ rows: CustomCardRow[]; count: number; offset: number }> {
	const client = createClient();
	const { sourceId, page, pageSize, filters } = query;
	const offset = (page - 1) * pageSize;

	let q = client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT, { count: 'exact' })
		.eq('is_public', true);

	// Hard invariant: unmatched custom cards (no official match) are never listed.
	q = q.not('oracle_id', 'is', null);

	if (sourceId) q = q.eq('source_id', sourceId);
	if (filters.name) q = q.ilike('name', `%${filters.name}%`);
	if (filters.type?.length) {
		q = filters.type.reduce((acc, t) => acc.ilike('type_line', `%${t}%`), q);
	}
	if (filters.oracleText) q = q.ilike('oracle_text', `%${filters.oracleText}%`);
	if (filters.set) q = q.eq('set_code', filters.set);
	if (filters.rarities?.length) q = q.in('rarity', filters.rarities);
	if (filters.cardTypes?.length) q = q.in('card_type', filters.cardTypes);
	if (filters.mpcTagsMustHave?.length) q = q.overlaps('tags', filters.mpcTagsMustHave);
	if (filters.mpcTagsMustNotHave?.length)
		q = filters.mpcTagsMustNotHave.reduce((acc, tag) => acc.not('tags', 'cs', `{${tag}}`), q);
	if (filters.oracleId) q = q.eq('oracle_id', filters.oracleId);
	if (filters.colors?.length && filters.colorMatch === 'include')
		q = q.overlaps('colors', filters.colors);

	const cmcClause = parseCmcClause(filters.cmc ?? '');
	if (cmcClause) {
		const { op, value } = cmcClause;
		const cmcOps: Record<string, (col: string, val: number) => typeof q> = {
			'>=': (col, val) => q.gte(col, val),
			'<=': (col, val) => q.lte(col, val),
			'>': (col, val) => q.gt(col, val),
			'<': (col, val) => q.lt(col, val),
		};
		q = (cmcOps[op] ?? ((col, val) => q.eq(col, val)))('cmc', value);
	}

	let sortColumn = 'name';
	if (filters.order === 'cmc') sortColumn = 'cmc';
	else if (filters.order === 'rarity') sortColumn = 'rarity';
	const ascending = filters.dir !== 'desc';
	q = q.order(sortColumn, { ascending }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);
	return { rows: data as CustomCardRow[], count: count ?? 0, offset };
}
