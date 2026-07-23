// Pure catalog reader: DB → ScryfallCard | null. No Scryfall, no fallback (that lives in
// card-source). Loads a print + its definition + faces (+ set) and rebuilds via the assembler.

import { createClient } from '@/lib/supabase/server';
import { rowsToScryfallCard } from './assembler';
import type { DefinitionRow, PrintRow, DefinitionFaceRow, PrintFaceRow, SetRow } from './assembler';
import type { ScryfallCard, ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';

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

const OR_CHUNK = 100; // bound each grouped query so the PostgREST URL stays under limits

// The target language for an identifier: its own lang, else the batch default, else 'en'.
function langFor(id: ScryfallCardIdentifier, batchLang?: string): string {
	return id.lang ?? batchLang ?? 'en';
}

// Pick the best print row for a wanted (set, collector_number, lang): the requested-lang
// row if present, else the English row (intra-DB fallback).
function pickByLang(rows: PrintRow[], lang: string): PrintRow | undefined {
	return rows.find((r) => r.lang === lang) ?? rows.find((r) => r.lang === 'en');
}

// Buckets of raw identifier values, grouped by resolution form.
interface IdentifierGroups {
	idVals: string[];
	setNumberVals: Array<{ set: string; collector_number: string }>;
	enNames: string[];
	frNames: string[];
	oracleVals: string[];
	mtgoVals: number[];
	multiverseVals: number[];
}

function groupIdentifiers(
	identifiers: ScryfallCardIdentifier[],
	batchLang?: string
): IdentifierGroups {
	const groups: IdentifierGroups = {
		idVals: [],
		setNumberVals: [],
		enNames: [],
		frNames: [],
		oracleVals: [],
		mtgoVals: [],
		multiverseVals: [],
	};
	for (const id of identifiers) {
		if (id.id) groups.idVals.push(id.id);
		else if (id.set && id.collector_number)
			groups.setNumberVals.push({ set: id.set, collector_number: id.collector_number });
		else if (id.name) {
			if (langFor(id, batchLang) !== 'en') groups.frNames.push(id.name);
			groups.enNames.push(id.name); // always also try EN by name (FR-then-EN best effort)
		} else if (id.oracle_id) groups.oracleVals.push(id.oracle_id);
		else if (id.mtgo_id != null) groups.mtgoVals.push(id.mtgo_id);
		else if (id.multiverse_id != null) groups.multiverseVals.push(id.multiverse_id);
	}
	return groups;
}

// Fetch, in bounded chunks, every print row that could satisfy any identifier in `groups`.
async function fetchGroupedPrints(sb: SB, groups: IdentifierGroups): Promise<PrintRow[]> {
	const prints: PrintRow[] = [];
	const pushRows = (rows: PrintRow[] | null) => {
		if (rows) prints.push(...rows);
	};

	// id group
	for (let i = 0; i < groups.idVals.length; i += OR_CHUNK) {
		const chunk = [...new Set(groups.idVals.slice(i, i + OR_CHUNK))];
		const { data } = await sb.from('card_prints').select(PRINT_COLS).in('id', chunk);
		pushRows(data as PrintRow[] | null);
	}
	// set+number group (fetch fr+en for each, pickByLang chooses)
	for (let i = 0; i < groups.setNumberVals.length; i += OR_CHUNK) {
		const chunk = groups.setNumberVals.slice(i, i + OR_CHUNK);
		const orExpr = chunk
			.map((c) => `and(set.eq.${c.set},collector_number.eq.${c.collector_number})`)
			.join(',');
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.or(orExpr)
			.in('lang', ['fr', 'en']);
		pushRows(data as PrintRow[] | null);
	}
	// oracle group
	for (let i = 0; i < groups.oracleVals.length; i += OR_CHUNK) {
		const chunk = [...new Set(groups.oracleVals.slice(i, i + OR_CHUNK))];
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.in('oracle_id', chunk)
			.in('lang', ['fr', 'en']);
		pushRows(data as PrintRow[] | null);
	}
	// external-id groups
	for (let i = 0; i < groups.mtgoVals.length; i += OR_CHUNK) {
		const chunk = [...new Set(groups.mtgoVals.slice(i, i + OR_CHUNK))];
		const { data } = await sb.from('card_prints').select(PRINT_COLS).in('mtgo_id', chunk);
		pushRows(data as PrintRow[] | null);
	}
	for (const mv of [...new Set(groups.multiverseVals)]) {
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.contains('multiverse_ids', [mv]);
		pushRows(data as PrintRow[] | null);
	}
	// name groups: FR printed_name, then EN via definitions.name → its prints
	for (const name of [...new Set(groups.frNames)]) {
		const { data } = await sb
			.from('card_prints')
			.select(PRINT_COLS)
			.ilike('printed_name', name)
			.eq('lang', 'fr');
		pushRows(data as PrintRow[] | null);
	}
	if (groups.enNames.length > 0) {
		const uniqueEn = [...new Set(groups.enNames)];
		for (let i = 0; i < uniqueEn.length; i += OR_CHUNK) {
			const chunk = uniqueEn.slice(i, i + OR_CHUNK);
			const { data: defs } = await sb
				.from('card_definitions')
				.select('oracle_id, name')
				.in('name', chunk);
			const oracleIds = [
				...new Set(((defs as { oracle_id: string }[] | null) ?? []).map((d) => d.oracle_id)),
			];
			for (let j = 0; j < oracleIds.length; j += OR_CHUNK) {
				const oc = oracleIds.slice(j, j + OR_CHUNK);
				const { data } = await sb
					.from('card_prints')
					.select(PRINT_COLS)
					.in('oracle_id', oc)
					.eq('lang', 'en');
				pushRows(data as PrintRow[] | null);
			}
		}
	}

	return prints;
}

// Everything `resolveOne` needs to turn one identifier into a card, pre-indexed once per batch.
interface ResolveContext {
	prints: PrintRow[];
	cards: ScryfallCard[];
	cardByPrintId: Map<string, ScryfallCard>;
	printsBySetNumber: Map<string, PrintRow[]>;
	batchLang?: string;
}

function resolveById(ctx: ResolveContext, id: ScryfallCardIdentifier): ScryfallCard | null {
	return ctx.cardByPrintId.get(id.id!) ?? null;
}

function resolveBySetNumber(
	ctx: ResolveContext,
	id: ScryfallCardIdentifier,
	lang: string
): ScryfallCard | null {
	const rows = ctx.printsBySetNumber.get(`${id.set}/${id.collector_number}`) ?? [];
	const row = pickByLang(rows, lang);
	return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;
}

function resolveByName(
	ctx: ResolveContext,
	id: ScryfallCardIdentifier,
	lang: string
): ScryfallCard | null {
	const target = id.name!.toLowerCase();
	if (lang !== 'en') {
		const fr = ctx.prints.find(
			(p) => p.lang === 'fr' && (p.printed_name ?? '').toLowerCase() === target
		);
		if (fr) return ctx.cardByPrintId.get(fr.id) ?? null;
	}
	// EN by name: find a card whose (assembled) name matches
	const en = ctx.cards.find((c) => c.lang === 'en' && c.name.toLowerCase() === target);
	return en ?? null;
}

function resolveByOracleId(
	ctx: ResolveContext,
	id: ScryfallCardIdentifier,
	lang: string
): ScryfallCard | null {
	const rows = ctx.prints.filter((p) => p.oracle_id === id.oracle_id);
	const row = pickByLang(rows, lang);
	return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;
}

function resolveByMtgoId(ctx: ResolveContext, id: ScryfallCardIdentifier): ScryfallCard | null {
	const row = ctx.prints.find((p) => p.mtgo_id === id.mtgo_id);
	return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;
}

function resolveByMultiverseId(
	ctx: ResolveContext,
	id: ScryfallCardIdentifier
): ScryfallCard | null {
	const row = ctx.prints.find((p) => (p.multiverse_ids ?? []).includes(id.multiverse_id!));
	return row ? (ctx.cardByPrintId.get(row.id) ?? null) : null;
}

function resolveOne(ctx: ResolveContext, id: ScryfallCardIdentifier): ScryfallCard | null {
	const lang = langFor(id, ctx.batchLang);
	if (id.id) return resolveById(ctx, id);
	if (id.set && id.collector_number) return resolveBySetNumber(ctx, id, lang);
	if (id.name) return resolveByName(ctx, id, lang);
	if (id.oracle_id) return resolveByOracleId(ctx, id, lang);
	if (id.mtgo_id != null) return resolveByMtgoId(ctx, id);
	if (id.multiverse_id != null) return resolveByMultiverseId(ctx, id);
	return null;
}

export async function byCollection(
	identifiers: ScryfallCardIdentifier[],
	opts?: { lang?: string }
): Promise<(ScryfallCard | null)[]> {
	if (identifiers.length === 0) return [];
	const sb = await createClient();

	// Collect the print rows needed, grouped by form, in bounded queries, then resolve each
	// identifier's slot against them in memory.
	const groups = groupIdentifiers(identifiers, opts?.lang);
	const prints = await fetchGroupedPrints(sb, groups);

	// Assemble every fetched print once, then index for slot resolution.
	const cards = await assemblePrints(sb, prints);
	const cardByPrintId = new Map(cards.map((c) => [c.id, c]));
	const printsBySetNumber = new Map<string, PrintRow[]>();
	for (const p of prints) {
		const key = `${p.set}/${p.collector_number}`;
		const arr = printsBySetNumber.get(key) ?? [];
		arr.push(p);
		printsBySetNumber.set(key, arr);
	}

	const ctx: ResolveContext = {
		prints,
		cards,
		cardByPrintId,
		printsBySetNumber,
		batchLang: opts?.lang,
	};
	return identifiers.map((id) => resolveOne(ctx, id));
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
