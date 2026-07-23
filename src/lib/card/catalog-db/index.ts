// Pure catalog reader: DB → ScryfallCard | null. No Scryfall, no fallback (that lives in
// card-source). Loads a print + its definition + faces (+ set) and rebuilds via the assembler.

import { createClient } from '@/lib/supabase/server';
import { rowsToScryfallCard } from './assembler';
import type { DefinitionRow, PrintRow, DefinitionFaceRow, PrintFaceRow, SetRow } from './assembler';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const PRINT_COLS =
	'id, oracle_id, set, collector_number, lang, rarity, released_at, artist, border_color, frame, image_status, image_uris, finishes, promo, reprint, variation, digital, printed_name, printed_type_line, printed_text, multiverse_ids, mtgo_id, arena_id, tcgplayer_id, cardmarket_id';
const DEF_COLS =
	'oracle_id, name, type_line, oracle_text, mana_cost, cmc, colors, color_identity, keywords, power, toughness, loyalty, defense, legalities, reserved, edhrec_rank, layout';
const DEF_FACE_COLS =
	'oracle_id, face_index, name, type_line, oracle_text, mana_cost, colors, power, toughness, loyalty';
const PRINT_FACE_COLS =
	'print_id, face_index, artist, illustration_id, image_uris, printed_name, printed_type_line, printed_text';
const SET_COLS = 'code, id, name, set_type';

type SB = Awaited<ReturnType<typeof createClient>>;

// Given a set of print rows, load the definitions/faces/sets they need and assemble.
async function assemblePrints(sb: SB, prints: PrintRow[]): Promise<ScryfallCard[]> {
	if (prints.length === 0) return [];
	const oracleIds = [...new Set(prints.map((p) => p.oracle_id))];
	const printIds = prints.map((p) => p.id);
	const setCodes = [...new Set(prints.map((p) => p.set))];

	const [defsRes, defFacesRes, printFacesRes, setsRes] = await Promise.all([
		sb.from('card_definitions').select(DEF_COLS).in('oracle_id', oracleIds),
		sb.from('card_definition_faces').select(DEF_FACE_COLS).in('oracle_id', oracleIds),
		sb.from('card_print_faces').select(PRINT_FACE_COLS).in('print_id', printIds),
		sb.from('card_sets').select(SET_COLS).in('code', setCodes),
	]);

	const defByOracle = new Map(
		((defsRes.data as DefinitionRow[] | null) ?? []).map((d) => [d.oracle_id, d])
	);
	const defFacesByOracle = new Map<string, DefinitionFaceRow[]>();
	for (const f of (defFacesRes.data as DefinitionFaceRow[] | null) ?? []) {
		const arr = defFacesByOracle.get(f.oracle_id) ?? [];
		arr.push(f);
		defFacesByOracle.set(f.oracle_id, arr);
	}
	const printFacesByPrint = new Map<string, PrintFaceRow[]>();
	for (const f of (printFacesRes.data as PrintFaceRow[] | null) ?? []) {
		const arr = printFacesByPrint.get(f.print_id) ?? [];
		arr.push(f);
		printFacesByPrint.set(f.print_id, arr);
	}
	const setByCode = new Map(((setsRes.data as SetRow[] | null) ?? []).map((s) => [s.code, s]));

	const out: ScryfallCard[] = [];
	for (const print of prints) {
		const def = defByOracle.get(print.oracle_id);
		if (!def) continue; // a print without its definition should not happen (FK), skip defensively
		out.push(
			rowsToScryfallCard({
				def,
				print,
				defFaces: defFacesByOracle.get(print.oracle_id) ?? [],
				printFaces: printFacesByPrint.get(print.id) ?? [],
				set: setByCode.get(print.set) ?? null,
			})
		);
	}
	return out;
}

async function firstPrintCard(
	sb: SB,
	query: PromiseLike<{ data: unknown; error: unknown }>
): Promise<ScryfallCard | null> {
	const { data, error } = await query;
	if (error || !data || (data as PrintRow[]).length === 0) return null;
	const cards = await assemblePrints(sb, data as PrintRow[]);
	return cards[0] ?? null;
}

export async function byId(id: string): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(sb, sb.from('card_prints').select(PRINT_COLS).eq('id', id).limit(1));
}

export async function bySetNumberLang(
	set: string,
	collectorNumber: string,
	lang: string
): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(
		sb,
		sb
			.from('card_prints')
			.select(PRINT_COLS)
			.eq('set', set)
			.eq('collector_number', collectorNumber)
			.eq('lang', lang)
			.limit(1)
	);
}

export async function bySetNumber(
	set: string,
	collectorNumber: string
): Promise<ScryfallCard | null> {
	return bySetNumberLang(set, collectorNumber, 'en');
}

export async function byName(name: string, opts?: { lang?: string }): Promise<ScryfallCard | null> {
	const sb = await createClient();
	const { data: defs } = await sb
		.from('card_definitions')
		.select('oracle_id')
		.eq('name', name)
		.limit(1);
	const oracleId = (defs as { oracle_id: string }[] | null)?.[0]?.oracle_id;
	if (!oracleId) return null;
	const lang = opts?.lang ?? 'en';
	return firstPrintCard(
		sb,
		sb
			.from('card_prints')
			.select(PRINT_COLS)
			.eq('oracle_id', oracleId)
			.eq('lang', lang)
			.order('released_at', { ascending: false })
			.limit(1)
	);
}

async function byExternalId(column: string, id: number): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(sb, sb.from('card_prints').select(PRINT_COLS).eq(column, id).limit(1));
}
export const byMtgoId = (id: number) => byExternalId('mtgo_id', id);
export const byArenaId = (id: number) => byExternalId('arena_id', id);
export const byTcgplayerId = (id: number) => byExternalId('tcgplayer_id', id);
export const byCardmarketId = (id: number) => byExternalId('cardmarket_id', id);

export async function byMultiverseId(id: number): Promise<ScryfallCard | null> {
	const sb = await createClient();
	return firstPrintCard(
		sb,
		sb.from('card_prints').select(PRINT_COLS).contains('multiverse_ids', [id]).limit(1)
	);
}

export async function byCollection(ids: string[]): Promise<(ScryfallCard | null)[]> {
	if (ids.length === 0) return [];
	const sb = await createClient();
	const { data } = await sb
		.from('card_prints')
		.select(PRINT_COLS)
		.in('id', [...new Set(ids)]);
	const cards = await assemblePrints(sb, (data as PrintRow[] | null) ?? []);
	const byIdMap = new Map(cards.map((c) => [c.id, c]));
	return ids.map((id) => byIdMap.get(id) ?? null);
}

export async function printsByOracleId(oracleId: string): Promise<ScryfallCard[]> {
	const sb = await createClient();
	const { data } = await sb
		.from('card_prints')
		.select(PRINT_COLS)
		.eq('oracle_id', oracleId)
		.order('released_at', { ascending: false });
	return assemblePrints(sb, (data as PrintRow[] | null) ?? []);
}
