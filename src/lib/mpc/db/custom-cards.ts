import type { CardType, MpcCard, MpcSource } from '@/lib/mpc/types';
import {
	type CustomCardRow,
	type CustomCardSourceRow,
	type CustomCardQueryFilters,
	fetchCustomCardSourceRows,
	fetchCustomCardSourceRowsWithCounts,
	queryCustomCardRows,
} from '@/lib/supabase/queries/custom-cards';

export type { CustomCardQueryFilters };
export type { CardType };

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
	return (await fetchCustomCardSourceRows()).map(rowToMpcSource);
}

export interface MpcSourceWithCount extends MpcSource {
	cardCount: number;
}

export async function getCustomCardSourcesWithCount(): Promise<MpcSourceWithCount[]> {
	const { sources, countBySource } = await fetchCustomCardSourceRowsWithCounts();
	return sources
		.map((row) => ({ ...rowToMpcSource(row), cardCount: countBySource.get(row.id) ?? 0 }))
		.filter((s) => s.cardCount > 0);
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

export async function queryCustomCards(query: CustomCardQuery): Promise<CustomCardPage> {
	const { rows: rawRows, count, offset } = await queryCustomCardRows(query);
	let rows = rawRows.map(rowToMpcCard);
	const rawPageCount = rows.length; // capture before post-filter

	// Post-query color filtering for exact/atMost (Supabase lacks native exact array equality)
	const { filters } = query;
	if (filters.colors?.length) {
		const sel = filters.colors;
		if (filters.colorMatch === 'exact') rows = rows.filter((c) => colorMatchesExact(c, sel));
		else if (filters.colorMatch === 'atMost') rows = rows.filter((c) => colorMatchesAtMost(c, sel));
	}

	return { cards: rows, hasMore: offset + rawPageCount < count, total: count };
}
