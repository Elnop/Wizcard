import { createClient } from '@/lib/supabase/client';
import type { CardEditorPayload, CardLayoutId, CardRarity } from '@/lib/card-editor/types';

export type CustomCardAssetBucket = 'custom-cards' | 'custom-card-art';

export interface CustomCardAssetLocation {
	bucket: CustomCardAssetBucket;
	path: string;
}

export interface UserCreatedCardRowInput {
	id: string;
	name: string;
	raw_name: string;
	display_name: string;
	image_storage_path: string;
	art_storage_path: string | null;
	back_image_storage_path: string | null;
	oracle_id: string;
	source_type: 'user_created';
	is_public: boolean;
	created_by: string;
	card_type: 'card' | 'token';
	language: string;
	tags: string[];
	set_code: string;
	collector_number: string;
	colors: string[];
	color_identity: string[];
	cmc: number;
	type_line: string;
	mana_cost: string;
	oracle_text: string;
	rarity: CardRarity;
	set_name: string;
	artist: string;
	layout: CardLayoutId;
	editor_payload: CardEditorPayload;
}

export async function uploadCustomCardAsset(
	bucket: CustomCardAssetBucket,
	path: string,
	blob: Blob
): Promise<void> {
	const client = createClient();
	const { error } = await client.storage.from(bucket).upload(path, blob, {
		cacheControl: '31536000',
		contentType: blob.type,
		upsert: false,
	});
	if (error) throw new Error(`Failed to upload custom card asset: ${error.message}`);
}

export async function removeCustomCardAssets(assets: CustomCardAssetLocation[]): Promise<void> {
	if (assets.length === 0) return;
	const client = createClient();
	const buckets = new Map<CustomCardAssetBucket, string[]>();
	for (const asset of assets) {
		buckets.set(asset.bucket, [...(buckets.get(asset.bucket) ?? []), asset.path]);
	}
	await Promise.all(
		[...buckets].map(([bucket, paths]) => client.storage.from(bucket).remove(paths))
	);
}

export async function insertUserCreatedCardRow(row: UserCreatedCardRowInput): Promise<void> {
	const client = createClient();
	const { error } = await client.from('custom_cards').insert(row);
	if (error) throw new Error(`Failed to save custom card: ${error.message}`);
}
