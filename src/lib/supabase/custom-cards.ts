import { createClient } from '@/lib/supabase/client';
import type { CardSourceType, CardType, MpcCard, MpcSource } from '@/lib/mpc/types';

interface CustomCardSourceRow {
	id: string;
	name: string;
	description: string | null;
	tags: string[];
}

interface CustomCardRow {
	id: string;
	source_id: string | null;
	name: string;
	raw_name: string;
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
}

function resolveImageUrl(row: CustomCardRow): string {
	if (row.image_storage_path) {
		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
		return `${supabaseUrl}/storage/v1/object/public/custom-cards/${row.image_storage_path}`;
	}
	return row.image_drive_url ?? '';
}

function rowToMpcSource(row: CustomCardSourceRow): MpcSource {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? undefined,
		isBuiltIn: true,
		tags: row.tags,
	};
}

function rowToMpcCard(row: CustomCardRow): MpcCard {
	return {
		id: row.id.startsWith('mpc:') ? row.id.slice(4) : row.id,
		name: row.name,
		rawName: row.raw_name,
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
	};
}

export async function getCustomCardSources(): Promise<MpcSource[]> {
	const client = createClient();
	const { data, error } = await client
		.from('custom_card_sources')
		.select('id, name, description, tags')
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
		client.from('custom_card_sources').select('id, name, description, tags').order('name'),
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

const CUSTOM_CARD_SELECT =
	'id, source_id, name, raw_name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, variants, set_code, collector_number, colors, color_identity, cmc, type_line, mana_cost, oracle_text, rarity, set_name, artist';

export async function getCustomCards(sourceId: string): Promise<MpcCard[]> {
	const client = createClient();

	const { data, error } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.eq('source_id', sourceId)
		.eq('is_public', true)
		.order('name')
		.limit(10_000);

	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);
	return (data as CustomCardRow[]).map(rowToMpcCard);
}

export async function getAllCustomCards(): Promise<MpcCard[]> {
	const client = createClient();

	const { data, error } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.eq('is_public', true)
		.order('name')
		.limit(10_000);

	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);
	return (data as CustomCardRow[]).map(rowToMpcCard);
}
