import { createClient } from '@/lib/supabase/client';
import type { CardSourceType, CardType, MpcCard, MpcSource } from '@/lib/mpc/types';

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
	oracle_id: string | null;
	source_type: CardSourceType;
	is_public: boolean;
	created_by: string | null;
	card_type: CardType;
	language: string | null;
	tags: string[];
	variants: string[];
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
}

function resolveImageUrl(row: CustomCardRow): string {
	if (row.image_storage_path) {
		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
		return `${supabaseUrl}/storage/v1/object/public/custom-cards/${row.image_storage_path}`;
	}
	return row.image_drive_url ?? '';
}

export function rowToMpcSource(row: CustomCardSourceRow): MpcSource {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? undefined,
		isBuiltIn: true,
		tags: row.tags,
		driveFolderId: row.drive_folder_id,
	};
}

export function rowToMpcCard(row: CustomCardRow): MpcCard {
	return {
		id: row.id.startsWith('mpc:') ? row.id.slice(4) : row.id,
		name: row.name,
		rawName: row.raw_name,
		displayName: row.display_name ?? null,
		sourceId: row.source_id,
		imageUrl: resolveImageUrl(row),
		isCustom: true,
		oracleId: row.oracle_id ?? undefined,
		sourceType: row.source_type,
		isPublic: row.is_public,
		createdBy: row.created_by ?? undefined,
		cardType: row.card_type ?? 'card',
		language: row.language ?? null,
		tags: row.tags ?? [],
		variants: row.variants ?? [],
		setCode: row.set_code ?? null,
		collectorNumber: row.collector_number ?? null,
		colors: row.colors ?? undefined,
		colorIdentity: row.color_identity ?? undefined,
		cmc: row.cmc ?? undefined,
		typeLine: row.type_line ?? undefined,
		manaCost: row.mana_cost ?? undefined,
		oracleText: row.oracle_text ?? undefined,
		rarity: row.rarity ?? undefined,
		setName: row.set_name ?? undefined,
		artist: row.artist ?? undefined,
		driveFolderPath: row.drive_folder_path ?? null,
	};
}

export async function getCustomCardSources(): Promise<MpcSource[]> {
	const client = createClient();
	const { data, error } = await client
		.from('custom_card_sources')
		.select(CUSTOM_CARD_SOURCE_SELECT)
		.order('name');

	if (error) throw new Error(`Failed to load custom card sources: ${error.message}`);
	return (data as CustomCardSourceRow[]).map(rowToMpcSource);
}

export interface MpcSourceWithCount extends MpcSource {
	cardCount: number;
}

export async function getCustomCardSourcesWithCount(): Promise<MpcSourceWithCount[]> {
	const client = createClient();

	const [sourcesResult, cardsResult] = await Promise.all([
		client.from('custom_card_sources').select(CUSTOM_CARD_SOURCE_SELECT).order('name'),
		client.from('custom_cards').select('source_id').eq('is_public', true),
	]);

	if (sourcesResult.error)
		throw new Error(`Failed to load custom card sources: ${sourcesResult.error.message}`);
	if (cardsResult.error)
		throw new Error(`Failed to load custom card counts: ${cardsResult.error.message}`);

	const countBySource = new Map<string, number>();
	for (const row of cardsResult.data as { source_id: string }[]) {
		countBySource.set(row.source_id, (countBySource.get(row.source_id) ?? 0) + 1);
	}

	return (sourcesResult.data as CustomCardSourceRow[])
		.map((row) => ({
			...rowToMpcSource(row),
			cardCount: countBySource.get(row.id) ?? 0,
		}))
		.filter((s) => s.cardCount > 0);
}

export const CUSTOM_CARD_SOURCE_SELECT = 'id, name, description, drive_folder_id, tags';

export const CUSTOM_CARD_SELECT =
	'id, source_id, name, raw_name, display_name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, variants, set_code, collector_number, colors, color_identity, cmc, type_line, mana_cost, oracle_text, rarity, set_name, artist, drive_folder_path';

export interface CustomCardQueryFilters {
	name?: string;
	colors?: string[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type?: string;
	set?: string;
	cmc?: string;
	rarities?: string[];
	oracleText?: string;
	mpcTagsMustHave?: string[];
	mpcTagsMustNotHave?: string[];
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
	oracleId?: string;
	cardTypes?: CardType[];
	order?: string;
	dir?: 'asc' | 'desc' | 'auto';
}

export interface CustomCardQuery {
	sourceId?: string | null;
	page: number;
	pageSize: number;
	filters: CustomCardQueryFilters;
}

export interface CustomCardPage {
	cards: MpcCard[];
	hasMore: boolean;
	total: number;
}

function parseCmcClause(raw: string): { op: string; value: number } | null {
	if (!raw) return null;
	const match = raw.match(/^(>=|<=|>|<|:)?(\d+)$/);
	if (!match) return null;
	return { op: match[1] ?? ':', value: parseInt(match[2], 10) };
}

function colorMatchesExact(c: MpcCard, sel: string[]): boolean {
	return (
		c.colors !== undefined &&
		c.colors.length === sel.length &&
		sel.every((col) => c.colors!.includes(col))
	);
}

function colorMatchesAtMost(c: MpcCard, sel: string[]): boolean {
	return c.colors === undefined || c.colors.every((col) => sel.includes(col));
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- query builder: one conditional per optional filter
export async function queryCustomCards(query: CustomCardQuery): Promise<CustomCardPage> {
	const client = createClient();
	const { sourceId, page, pageSize, filters } = query;
	const offset = (page - 1) * pageSize;

	let q = client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT, { count: 'exact' })
		.eq('is_public', true);

	if (sourceId) q = q.eq('source_id', sourceId);
	if (filters.name) q = q.ilike('name', `%${filters.name}%`);
	if (filters.type) q = q.ilike('type_line', `%${filters.type}%`);
	if (filters.oracleText) q = q.ilike('oracle_text', `%${filters.oracleText}%`);
	if (filters.set) q = q.eq('set_code', filters.set);
	if (filters.rarities?.length) q = q.in('rarity', filters.rarities);
	if (filters.cardTypes?.length) q = q.in('card_type', filters.cardTypes);
	if (filters.mpcTagsMustHave?.length) q = q.overlaps('tags', filters.mpcTagsMustHave);
	if (filters.mpcTagsMustNotHave?.length)
		q = filters.mpcTagsMustNotHave.reduce((acc, tag) => acc.not('tags', 'cs', `{${tag}}`), q);
	if (filters.oracleIdFilter === 'defined') q = q.not('oracle_id', 'is', null);
	else if (filters.oracleIdFilter === 'undefined') q = q.is('oracle_id', null);
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

	let rows = (data as CustomCardRow[]).map(rowToMpcCard);
	const rawPageCount = rows.length; // capture before post-filter

	// Post-query color filtering for exact/atMost (Supabase lacks native exact array equality)
	if (filters.colors?.length) {
		const sel = filters.colors;
		if (filters.colorMatch === 'exact') rows = rows.filter((c) => colorMatchesExact(c, sel));
		else if (filters.colorMatch === 'atMost') rows = rows.filter((c) => colorMatchesAtMost(c, sel));
	}

	const total = count ?? 0;
	return {
		cards: rows,
		hasMore: offset + rawPageCount < total,
		total,
	};
}
