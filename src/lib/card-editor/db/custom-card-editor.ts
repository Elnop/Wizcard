import {
	calculateManaValue,
	deriveCardColors,
	getCardTypeForLayout,
	normalizeSetCode,
	parseCardTags,
	toCardEditorPayload,
} from '@/lib/card-editor/draft';
import { dataUrlToBlob } from '@/lib/card-editor/image';
import type { CustomCardDraft } from '@/lib/card-editor/types';
import {
	insertUserCreatedCardRow,
	removeCustomCardAssets,
	uploadCustomCardAsset,
	type CustomCardAssetLocation,
	type UserCreatedCardRowInput,
} from '@/lib/supabase/queries/custom-card-editor';

export interface SaveCustomCardInput {
	draft: CustomCardDraft;
	userId: string;
	frontRender: Blob;
	backRender?: Blob;
}

const RENDER_BUCKET = 'custom-cards';
const SOURCE_ART_BUCKET = 'custom-card-art';

function extensionForMimeType(mimeType: string): string {
	if (mimeType === 'image/png') return 'png';
	if (mimeType === 'image/avif') return 'avif';
	if (mimeType === 'image/jpeg') return 'jpg';
	return 'webp';
}

async function uploadArtworkAssets(
	draft: CustomCardDraft,
	basePath: string,
	uploadedAssets: CustomCardAssetLocation[]
): Promise<Array<string | null>> {
	const paths: Array<string | null> = [];
	for (let index = 0; index < draft.faces.length; index += 1) {
		const artwork = draft.faces[index]?.artwork;
		if (!artwork?.dataUrl) {
			paths.push(null);
			continue;
		}
		const path = `${basePath}/face-${index + 1}-art.${extensionForMimeType(artwork.mimeType)}`;
		await uploadCustomCardAsset(SOURCE_ART_BUCKET, path, dataUrlToBlob(artwork.dataUrl));
		uploadedAssets.push({ bucket: SOURCE_ART_BUCKET, path });
		paths.push(path);
	}
	return paths;
}

function buildRow(
	draft: CustomCardDraft,
	userId: string,
	cardUuid: string,
	frontPath: string,
	backPath: string | null,
	artPaths: Array<string | null>
): UserCreatedCardRowInput {
	const face = draft.faces[0];
	const colors = deriveCardColors(face);
	return {
		id: `mpc:${cardUuid}`,
		name: face.name.trim(),
		raw_name: face.name.trim(),
		display_name: face.name.trim(),
		image_storage_path: frontPath,
		art_storage_path: artPaths[0] ?? null,
		back_image_storage_path: backPath,
		oracle_id: `custom:${cardUuid}`,
		source_type: 'user_created',
		is_public: draft.isPublic,
		created_by: userId,
		card_type: getCardTypeForLayout(draft.layoutId),
		language: draft.language,
		tags: ['custom:wizcard', ...parseCardTags(draft.tags)],
		set_code: normalizeSetCode(draft.setCode),
		collector_number: draft.collectorNumber.trim(),
		colors,
		color_identity: colors,
		cmc: calculateManaValue(face.manaCost),
		type_line: face.typeLine.trim(),
		mana_cost: face.manaCost.trim(),
		oracle_text: face.oracleText.trim(),
		rarity: draft.rarity,
		set_name: draft.setName.trim(),
		artist: face.artist.trim(),
		layout: draft.layoutId,
		editor_payload: toCardEditorPayload(draft, artPaths),
	};
}

export async function saveCustomCard({
	draft,
	userId,
	frontRender,
	backRender,
}: SaveCustomCardInput): Promise<string> {
	const cardUuid = crypto.randomUUID();
	const basePath = `${userId}/created/${cardUuid}`;
	const frontPath = `${basePath}/front.png`;
	const backPath = backRender ? `${basePath}/back.png` : null;
	const uploadedAssets: CustomCardAssetLocation[] = [];

	try {
		const artPaths = await uploadArtworkAssets(draft, basePath, uploadedAssets);
		await uploadCustomCardAsset(RENDER_BUCKET, frontPath, frontRender);
		uploadedAssets.push({ bucket: RENDER_BUCKET, path: frontPath });
		if (backRender && backPath) {
			await uploadCustomCardAsset(RENDER_BUCKET, backPath, backRender);
			uploadedAssets.push({ bucket: RENDER_BUCKET, path: backPath });
		}
		await insertUserCreatedCardRow(
			buildRow(draft, userId, cardUuid, frontPath, backPath, artPaths)
		);
		return `mpc:${cardUuid}`;
	} catch (error) {
		await removeCustomCardAssets(uploadedAssets);
		throw error;
	}
}
