// Pure inverse of the seed's toCatalogRows: given catalog rows for one print, rebuild a
// domain `Card`. No DB, no I/O. foil/nonfoil are derived from finishes.

import type { ScryfallImageUris } from '@/lib/scryfall/types/scryfall';
import type { Card, CardFace, CardImageStatus, MtgColor } from '@/types/cards';

export interface DefinitionRow {
	oracle_id: string;
	name: string;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	cmc: number | null;
	colors: string[] | null;
	color_identity: string[] | null;
	keywords: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
	defense: string | null;
	legalities: Record<string, string> | null;
	reserved: boolean | null;
	edhrec_rank: number | null;
	layout: string | null;
}

export interface PrintRow {
	id: string;
	oracle_id: string;
	set: string;
	collector_number: string;
	lang: string;
	rarity: string | null;
	released_at: string | null;
	artist: string | null;
	border_color: string | null;
	frame: string | null;
	image_status: string | null;
	image_uris: ScryfallImageUris | null;
	finishes: string[] | null;
	promo: boolean | null;
	reprint: boolean | null;
	variation: boolean | null;
	digital: boolean | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
	multiverse_ids: number[] | null;
	mtgo_id: number | null;
	arena_id: number | null;
	tcgplayer_id: number | null;
	cardmarket_id: number | null;
}

export interface DefinitionFaceRow {
	oracle_id: string;
	face_index: number;
	name: string | null;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	colors: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
}

export interface PrintFaceRow {
	print_id: string;
	face_index: number;
	artist: string | null;
	illustration_id: string | null;
	image_uris: ScryfallImageUris | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
}

export interface SetRow {
	code: string;
	id: string | null;
	name: string;
	set_type: string | null;
}

function buildFaces(
	defFaces: DefinitionFaceRow[],
	printFaces: PrintFaceRow[]
): CardFace[] | undefined {
	if (defFaces.length === 0) return undefined;
	const byIndex = new Map(printFaces.map((p) => [p.face_index, p]));
	return [...defFaces]
		.sort((a, b) => a.face_index - b.face_index)
		.map((df): CardFace => {
			const pf = byIndex.get(df.face_index);
			return {
				name: df.name ?? undefined,
				mana_cost: df.mana_cost ?? undefined,
				type_line: df.type_line ?? undefined,
				oracle_text: df.oracle_text ?? undefined,
				colors: (df.colors as MtgColor[]) ?? undefined,
				power: df.power ?? undefined,
				toughness: df.toughness ?? undefined,
				loyalty: df.loyalty ?? undefined,
				artist: pf?.artist ?? undefined,
				illustration_id: pf?.illustration_id ?? undefined,
				image_uris: pf?.image_uris ?? undefined, // null for shared-image split faces → undefined
				printed_name: pf?.printed_name ?? undefined,
				printed_type_line: pf?.printed_type_line ?? undefined,
				printed_text: pf?.printed_text ?? undefined,
			};
		});
}

export function rowsToCard(args: {
	def: DefinitionRow;
	print: PrintRow;
	defFaces: DefinitionFaceRow[];
	printFaces: PrintFaceRow[];
	set?: SetRow | null;
}): Card {
	const { def, print, defFaces, printFaces, set } = args;
	const finishes = print.finishes ?? [];
	return {
		id: print.id,
		oracle_id: def.oracle_id,
		name: def.name,
		lang: print.lang,
		layout: def.layout ?? 'normal',
		released_at: print.released_at ?? undefined,
		image_status: (print.image_status as CardImageStatus) ?? undefined,
		cmc: def.cmc ?? undefined,
		type_line: def.type_line ?? undefined,
		oracle_text: def.oracle_text ?? undefined,
		mana_cost: def.mana_cost ?? undefined,
		colors: (def.colors as MtgColor[]) ?? undefined,
		color_identity: (def.color_identity as MtgColor[]) ?? undefined,
		keywords: def.keywords ?? undefined,
		legalities: def.legalities ?? undefined,
		reserved: def.reserved ?? undefined,
		power: def.power ?? undefined,
		toughness: def.toughness ?? undefined,
		loyalty: def.loyalty ?? undefined,
		defense: def.defense ?? undefined,
		edhrec_rank: def.edhrec_rank ?? undefined,
		set: print.set,
		set_name: set?.name ?? undefined,
		collector_number: print.collector_number,
		rarity: print.rarity ?? undefined,
		artist: print.artist ?? undefined,
		border_color: print.border_color ?? undefined,
		frame: print.frame ?? undefined,
		image_uris: print.image_uris ?? undefined,
		finishes,
		foil: finishes.includes('foil'),
		nonfoil: finishes.includes('nonfoil'),
		promo: print.promo ?? undefined,
		reprint: print.reprint ?? undefined,
		variation: print.variation ?? undefined,
		digital: print.digital ?? undefined,
		printed_name: print.printed_name ?? undefined,
		printed_type_line: print.printed_type_line ?? undefined,
		printed_text: print.printed_text ?? undefined,
		multiverse_ids: print.multiverse_ids ?? undefined,
		mtgo_id: print.mtgo_id ?? undefined,
		arena_id: print.arena_id ?? undefined,
		tcgplayer_id: print.tcgplayer_id ?? undefined,
		cardmarket_id: print.cardmarket_id ?? undefined,
		card_faces: buildFaces(defFaces, printFaces),
	};
}
