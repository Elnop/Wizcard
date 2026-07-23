// Pure adapter: a raw ScryfallCard (provider form) → the provider-neutral domain Card.
// Modeled on toCustomCard. No I/O, no consumer yet — the seam later migration waves use to
// feed the app domain cards.

import type {
	ScryfallCard,
	ScryfallCardFace,
	ScryfallRelatedCard,
	ScryfallImageUris,
} from '@/lib/scryfall/types/scryfall';
import type { Card, CardFace, CardPart } from '@/types/cards';

function img3(uris: ScryfallImageUris | undefined): Card['image_uris'] {
	return uris ? { small: uris.small, normal: uris.normal, large: uris.large } : undefined;
}

function toFace(f: ScryfallCardFace): CardFace {
	return {
		name: f.name,
		type_line: f.type_line,
		oracle_text: f.oracle_text,
		mana_cost: f.mana_cost,
		colors: f.colors,
		power: f.power,
		toughness: f.toughness,
		loyalty: f.loyalty,
		artist: f.artist,
		illustration_id: f.illustration_id,
		image_uris: img3(f.image_uris),
		printed_name: f.printed_name,
		printed_type_line: f.printed_type_line,
		printed_text: f.printed_text,
	};
}

function toPart(p: ScryfallRelatedCard): CardPart {
	return { id: p.id, component: p.component, name: p.name, type_line: p.type_line };
}

export function toCard(s: ScryfallCard): Card {
	const finishes = s.finishes ?? [];
	return {
		id: s.id,
		oracle_id: s.oracle_id,
		name: s.name,
		lang: s.lang,
		layout: s.layout,
		type_line: s.type_line,
		oracle_text: s.oracle_text,
		mana_cost: s.mana_cost,
		cmc: s.cmc,
		colors: s.colors,
		color_identity: s.color_identity,
		keywords: s.keywords,
		power: s.power,
		toughness: s.toughness,
		loyalty: s.loyalty,
		defense: s.defense,
		legalities: s.legalities,
		reserved: s.reserved,
		edhrec_rank: s.edhrec_rank,
		set: s.set,
		set_name: s.set_name,
		collector_number: s.collector_number,
		rarity: s.rarity,
		released_at: s.released_at,
		artist: s.artist,
		frame: s.frame,
		border_color: s.border_color,
		image_status: s.image_status,
		image_uris: img3(s.image_uris),
		finishes,
		foil: s.foil ?? finishes.includes('foil'),
		nonfoil: s.nonfoil ?? finishes.includes('nonfoil'),
		promo: s.promo,
		reprint: s.reprint,
		variation: s.variation,
		digital: s.digital,
		printed_name: s.printed_name,
		printed_type_line: s.printed_type_line,
		printed_text: s.printed_text,
		card_faces: s.card_faces?.map(toFace),
		all_parts: s.all_parts?.map(toPart),
		multiverse_ids: s.multiverse_ids,
		mtgo_id: s.mtgo_id,
		arena_id: s.arena_id,
		tcgplayer_id: s.tcgplayer_id,
		cardmarket_id: s.cardmarket_id,
	};
}
