// Conversions between Scryfall API types and application card types

import type { ScryfallCard, ScryfallSet } from './types/scryfall';
import type { EnhancedMTGCard, EnhancedMTGSet } from './types/card';

// Build Scryfall image URL for a specific language
export function getLanguageImageUrl(scryfallCard: ScryfallCard, lang?: string): string | undefined {
	// Default or English: use the normal image URL
	if (!lang || lang === 'en') {
		if (!scryfallCard.image_uris && scryfallCard.card_faces) {
			return scryfallCard.card_faces[0]?.image_uris?.normal;
		}
		return scryfallCard.image_uris?.normal;
	}

	// Build localized image URL via Scryfall's /{set}/{number}/{lang} endpoint
	const set = scryfallCard.set;
	const number = scryfallCard.collector_number;

	if (set && number) {
		return `https://api.scryfall.com/cards/${set}/${number}/${lang}?format=image&version=normal`;
	}

	// Fallback to default English image
	if (!scryfallCard.image_uris && scryfallCard.card_faces) {
		return scryfallCard.card_faces[0]?.image_uris?.normal;
	}
	return scryfallCard.image_uris?.normal;
}

export function fromScryfallCard(
	scryfallCard: ScryfallCard,
	preferredLang?: string
): EnhancedMTGCard {
	return {
		id: scryfallCard.id,
		scryfallId: scryfallCard.id,
		oracleId: scryfallCard.oracle_id,
		name: scryfallCard.name,
		set: scryfallCard.set,
		setName: scryfallCard.set_name,
		rarity: scryfallCard.rarity,
		manaCost: scryfallCard.mana_cost,
		convertedManaCost: scryfallCard.cmc,
		type: scryfallCard.type_line,
		power: scryfallCard.power,
		toughness: scryfallCard.toughness,
		text: scryfallCard.oracle_text,
		flavor: scryfallCard.flavor_text,
		imageUrl: getLanguageImageUrl(scryfallCard, preferredLang),
		colors: scryfallCard.colors,
		colorIdentity: scryfallCard.color_identity,
		keywords: scryfallCard.keywords,
		legalities: scryfallCard.legalities,
		prices: {
			usd: scryfallCard.prices.usd,
			eur: scryfallCard.prices.eur,
		},
		lang: preferredLang || scryfallCard.lang,

		// Enhanced properties
		scryfallData: scryfallCard,
		imageUris: scryfallCard.image_uris,
		allPrices: scryfallCard.prices,
		artist: scryfallCard.artist,
		collectorNumber: scryfallCard.collector_number,
		released: scryfallCard.released_at,
		fullArt: scryfallCard.full_art,
		foil: scryfallCard.foil,
		nonfoil: scryfallCard.nonfoil,
		reserved: scryfallCard.reserved,
		etched: scryfallCard.finishes?.includes('etched') || false,
	};
}

export function fromScryfallSet(scryfallSet: ScryfallSet): EnhancedMTGSet {
	return {
		code: scryfallSet.code,
		scryfallId: scryfallSet.id,
		name: scryfallSet.name,
		releaseDate: scryfallSet.released_at || '',
		totalCards: scryfallSet.card_count,
		iconUrl: scryfallSet.icon_svg_uri,
		setType: scryfallSet.set_type,
		digital: scryfallSet.digital,
		foilOnly: scryfallSet.foil_only,

		// Enhanced properties
		scryfallData: scryfallSet,
		parentSetCode: scryfallSet.parent_set_code,
		block: scryfallSet.block,
		printedSize: scryfallSet.printed_size,
	};
}
