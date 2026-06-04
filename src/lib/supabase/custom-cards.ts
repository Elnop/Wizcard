import { createClient } from '@/lib/supabase/client';
import type { MpcCard, MpcSource } from '@/lib/mpc/types';

interface CustomCardSourceRow {
	id: string;
	name: string;
	description: string | null;
	tags: string[];
}

interface CustomCardRow {
	id: string;
	source_id: string;
	name: string;
	image_drive_url: string;
	oracle_id: string | null;
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
		sourceId: row.source_id,
		imageUrl: row.image_drive_url,
		isCustom: true,
		oracleId: row.oracle_id ?? undefined,
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

export async function getCustomCards(sourceId: string): Promise<MpcCard[]> {
	const client = createClient();

	const { data, error } = await client
		.from('custom_cards')
		.select('id, source_id, name, image_drive_url, oracle_id')
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
		.select('id, source_id, name, image_drive_url, oracle_id')
		.eq('is_public', true)
		.order('name')
		.limit(10_000);

	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);
	return (data as CustomCardRow[]).map(rowToMpcCard);
}
