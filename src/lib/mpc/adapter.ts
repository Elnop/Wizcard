import type { CustomCard, MpcCard, MpcSource } from './types';

export function toCustomCard(card: MpcCard, source: MpcSource): CustomCard {
	return {
		object: 'custom_card',
		id: `mpc:${card.id}`,
		name: card.name,
		...(card.oracleId ? { oracle_id: card.oracleId } : {}),
		custom: {
			source_id: card.sourceId,
			source_name: source.name,
			source_type: card.sourceType,
			card_type: card.cardType,
			image_url: card.imageUrl,
			lang: card.language,
			tags: card.tags,
			variants: card.variants,
			set_code: card.setCode,
			collector_number: card.collectorNumber,
			is_public: card.isPublic,
			raw_name: card.rawName,
		},
	};
}
