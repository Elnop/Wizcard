import { createClient } from '@/lib/supabase/client';
import type { MpcCard, MpcSource } from '@/lib/mpc/types';

interface CustomCardSourceRow {
	id: string;
	name: string;
	description: string | null;
	tags: string[];
	card_count: number;
}

interface CustomCardRow {
	id: string;
	source_id: string;
	name: string;
	image_storage_path: string | null;
	image_drive_url: string;
	tags: string[];
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

function rowToMpcCard(row: CustomCardRow, supabaseUrl: string): MpcCard {
	let imageUrl: string;
	if (row.image_storage_path) {
		imageUrl = `${supabaseUrl}/storage/v1/object/public/custom-cards/${row.image_storage_path}`;
	} else {
		imageUrl = row.image_drive_url;
	}
	return {
		id: row.id,
		name: row.name,
		sourceId: row.source_id,
		imageUrl,
		isCustom: true,
	};
}

export async function getCustomCardSources(): Promise<MpcSource[]> {
	const client = createClient();
	const { data, error } = await client
		.from('custom_card_sources')
		.select('id, name, description, tags, card_count')
		.order('name');

	if (error) throw new Error(`Failed to load custom card sources: ${error.message}`);
	return (data as CustomCardSourceRow[]).map(rowToMpcSource);
}

export async function getCustomCards(sourceId: string): Promise<MpcCard[]> {
	const client = createClient();
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

	const { data, error } = await client
		.from('custom_cards')
		.select('id, source_id, name, image_storage_path, image_drive_url, tags')
		.eq('source_id', sourceId)
		.eq('is_public', true)
		.order('name');

	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);
	return (data as CustomCardRow[]).map((row) => rowToMpcCard(row, supabaseUrl));
}
