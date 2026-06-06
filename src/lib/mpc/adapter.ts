import type { ScryfallColor, ScryfallRarity } from '@/lib/scryfall/types/scryfall';
import type { CustomCard, MpcCard, MpcSource } from './types';

export function toCustomCard(card: MpcCard, source: MpcSource): CustomCard {
	return {
		object: 'custom_card',
		id: `mpc:${card.id}`,
		name: card.name,
		...(card.oracleId ? { oracle_id: card.oracleId } : {}),
		colors: card.colors as ScryfallColor[] | undefined,
		color_identity: card.colorIdentity as ScryfallColor[] | undefined,
		cmc: card.cmc,
		type_line: card.typeLine,
		mana_cost: card.manaCost,
		oracle_text: card.oracleText,
		rarity: card.rarity as ScryfallRarity | undefined,
		set: card.setCode ?? undefined,
		set_name: card.setName,
		artist: card.artist,
		custom: {
			source_id: card.sourceId,
			source_name: source.name,
			source_type: card.sourceType,
			source_drive_folder_id: source.driveFolderId ?? null,
			card_type: card.cardType,
			image_url: card.imageUrl,
			lang: card.language,
			tags: card.tags,
			variants: card.variants,
			set_code: card.setCode,
			collector_number: card.collectorNumber,
			is_public: card.isPublic,
			raw_name: card.rawName,
			display_name: card.displayName ?? null,
		},
	};
}
