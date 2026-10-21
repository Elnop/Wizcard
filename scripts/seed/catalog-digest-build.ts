// Pure builder of the weekly "Catalogue" digest (story 3.3, issue #62).
//
// Input: the catalog_changes and scryfall_migrations rows of the window, plus the
// reference data the script read for them. Output: the fr/en title and Markdown body
// of the article, or null when nothing in the window is worth announcing. Every
// sentence comes from the templates of messages/catalog-digest/*.json (ICU, through
// next-intl's createTranslator; kept out of messages/{fr,en}.json so they never ship
// to the client): no LLM, no free text. Cards and sets are cited with
// the article directives of src/lib/articles/directives.ts. No side effects, so
// node:test covers it (catalog-digest-build.test.ts).

import { createTranslator } from 'next-intl';
import frMessages from '../../messages/catalog-digest/fr.json';
import enMessages from '../../messages/catalog-digest/en.json';

// --- Input -----------------------------------------------------------------------

/** One public.catalog_changes row (see 20261020120000_create_catalog_changes.sql). */
export interface ChangeRow {
	id: number;
	entity: 'print' | 'print_face' | 'definition' | 'definition_face';
	change: 'added' | 'removed' | 'updated';
	print_id: string | null;
	oracle_id: string | null;
	face_index: number | null;
	field: string | null;
	old_value: unknown;
	new_value: unknown;
}

/** One public.scryfall_migrations row. */
export interface MigrationRow {
	id: string;
	strategy: 'merge' | 'delete';
	old_scryfall_id: string;
	new_scryfall_id: string | null;
	note: string | null;
	performed_at: string;
	metadata: Record<string, unknown> | null;
	recorded_at: string;
}

/** A print as it exists NOW in the catalog (card_prints + its definition's name). */
export interface PrintRef {
	id: string;
	oracle_id: string;
	set: string;
	collector_number: string;
	lang: string;
	name: string | null;
}

export interface SetRef {
	code: string;
	name: string;
	released_at: string | null;
}

export interface DigestInput {
	changes: readonly ChangeRow[];
	migrations: readonly MigrationRow[];
	/** Current prints, by id: every print the window cites that still exists. */
	prints: ReadonlyMap<string, PrintRef>;
	/** card_definitions.name by oracle_id (errata, legalities, removed prints). */
	oracleNames: ReadonlyMap<string, string>;
	/** A representative current print per oracle_id, to link oracle-level lines. */
	oraclePrints: ReadonlyMap<string, string>;
	/** card_sets rows by code. */
	sets: ReadonlyMap<string, SetRef>;
	/** Current number of prints of every set that gained prints in the window. */
	setPrintCounts: ReadonlyMap<string, number>;
	/** Publication date (slug and the generic title use its UTC day). */
	date: Date;
}

export interface DigestArticle {
	slug: string;
	title_fr: string;
	title_en: string;
	body_fr: string;
	body_en: string;
}

// --- Limits (owner decisions, 2026-10-20) ------------------------------------------

/** Cards per `::cards` grid. */
export const GRID_LIMIT = 12;
/** Set blocks per section. */
export const SET_LIMIT = 10;
/** Above this many cards leaving Standard, one summary line instead of a list. */
export const ROTATION_THRESHOLD = 20;
/** Lines per list section (errata, legalities, removed, migrations). */
export const LINE_LIMIT = 50;
/** Never announced until #66 is resolved (per-print legality at Scryfall). */
export const IGNORED_FORMATS: ReadonlySet<string> = new Set(['oldschool']);

/** card_definitions fields announced as oracle errata; any other field is a correction. */
export const ORACLE_FIELDS: ReadonlySet<string> = new Set([
	'name',
	'type_line',
	'oracle_text',
	'mana_cost',
	'power',
	'toughness',
	'loyalty',
	'defense',
	'colors',
	'color_identity',
]);
/** card_definition_faces fields announced as oracle errata (its text fields). */
export const ORACLE_FACE_FIELDS: ReadonlySet<string> = new Set([
	'name',
	'type_line',
	'oracle_text',
	'mana_cost',
	'power',
	'toughness',
	'loyalty',
]);

const PRINTED_FIELDS = new Set(['printed_name', 'printed_type_line', 'printed_text']);
const HIGHRES = 'highres_scan';

// --- Classification ----------------------------------------------------------------

/** A set block: the cards of one set in one section. */
export interface SetGroup {
	set: string;
	printIds: string[];
}

export interface LegalityChange {
	oracleId: string;
	format: string;
	from: string | null;
	to: string | null;
}

export interface Classified {
	newSets: SetGroup[];
	/** Prints added to sets that already existed (one block per set). */
	newCards: SetGroup[];
	translations: SetGroup[];
	highres: SetGroup[];
	/** oracle_id -> changed oracle fields (definition or definition face). */
	errata: Map<string, Set<string>>;
	/** Per-card legality changes (rotation and new/removed formats excluded). */
	legalities: LegalityChange[];
	/** Number of cards leaving Standard (legal -> not_legal), 0 below the threshold. */
	rotation: number;
	/** Formats that appeared in the window, with the number of cards that got one. */
	newFormats: { format: string; count: number }[];
	/** Formats that disappeared in the window. */
	removedFormats: string[];
	removed: Record<string, unknown>[];
	migrations: MigrationRow[];
	/** Distinct entities (print, face, definition) with an unannounced change. */
	otherCorrections: number;
}

const triplet = (set: unknown, number: unknown, lang: unknown) => `${set}|${number}|${lang}`;
const entityKey = (c: ChangeRow) => `${c.entity}|${c.print_id}|${c.oracle_id}|${c.face_index}`;

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * A window spanning several seeds can hold the same field changed twice
 * (legal -> banned -> legal). Collapses every `updated` row per (entity, field) to
 * the first old value and the last new value, and drops net-zero changes. Other
 * rows pass through; the order (by id) is kept.
 */
export function collapseNetChanges(changes: readonly ChangeRow[]): ChangeRow[] {
	const merged = new Map<string, ChangeRow>();
	const out: (ChangeRow | string)[] = [];
	for (const c of [...changes].sort((a, b) => a.id - b.id)) {
		if (c.change !== 'updated') {
			out.push(c);
			continue;
		}
		const key = `${entityKey(c)}|${c.field}`;
		const prev = merged.get(key);
		if (prev) merged.set(key, { ...c, old_value: prev.old_value });
		else {
			merged.set(key, c);
			out.push(key);
		}
	}
	return out
		.map((x) => (typeof x === 'string' ? (merged.get(x) as ChangeRow) : x))
		.filter(
			(c) => c.change !== 'updated' || JSON.stringify(c.old_value) !== JSON.stringify(c.new_value)
		);
}

/** "12a" < "123" < "A-1": numeric part first, then the full string. */
function compareCollectorNumbers(a: string, b: string): number {
	const na = parseInt(a, 10);
	const nb = parseInt(b, 10);
	if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
	if (Number.isNaN(na) !== Number.isNaN(nb)) return Number.isNaN(na) ? 1 : -1;
	return a.localeCompare(b, 'en');
}

const langRank = (lang: string) => (lang === 'en' ? 0 : 1);

/** English prints first, then by collector number, then by id (stable). */
function comparePrints(a: PrintRef, b: PrintRef): number {
	if (a.lang !== b.lang) return langRank(a.lang) - langRank(b.lang) || a.lang.localeCompare(b.lang);
	return (
		compareCollectorNumbers(a.collector_number, b.collector_number) || a.id.localeCompare(b.id)
	);
}

/** Groups prints by set; blocks sorted by size (desc), then set code. */
function groupBySet(prints: Iterable<PrintRef>): SetGroup[] {
	const bySet = new Map<string, PrintRef[]>();
	for (const p of prints) {
		const list = bySet.get(p.set) ?? [];
		list.push(p);
		bySet.set(p.set, list);
	}
	return [...bySet.entries()]
		.map(([set, list]) => ({ set, printIds: list.sort(comparePrints).map((p) => p.id) }))
		.sort((a, b) => b.printIds.length - a.printIds.length || a.set.localeCompare(b.set));
}

/** Per-format legality differences, `oldschool` excluded. */
export function legalityDiff(
	oracleId: string,
	oldValue: unknown,
	newValue: unknown
): LegalityChange[] {
	const before = isObject(oldValue) ? oldValue : {};
	const after = isObject(newValue) ? newValue : {};
	const formats = new Set([...Object.keys(before), ...Object.keys(after)]);
	const out: LegalityChange[] = [];
	for (const format of [...formats].sort()) {
		if (IGNORED_FORMATS.has(format)) continue;
		const from = typeof before[format] === 'string' ? (before[format] as string) : null;
		const to = typeof after[format] === 'string' ? (after[format] as string) : null;
		if (from !== to) out.push({ oracleId, format, from, to });
	}
	return out;
}

interface Additions {
	/** Every print added in the window (updates on them are absorbed). */
	addedPrints: Set<string>;
	/** Added prints still announced (not removed again, not drift). */
	announcedAdded: Set<string>;
	addedDefs: Set<string>;
	/** Removed prints still announced, by id (full deleted row). */
	removedById: Map<string, Record<string, unknown>>;
}

function indexAdditions(changes: readonly ChangeRow[]): Additions {
	const addedPrints = new Set<string>();
	const addedDefs = new Set<string>();
	const removedById = new Map<string, Record<string, unknown>>();
	for (const c of changes) {
		if (c.entity === 'print' && c.change === 'added' && c.print_id) addedPrints.add(c.print_id);
		if (c.entity === 'definition' && c.change === 'added' && c.oracle_id)
			addedDefs.add(c.oracle_id);
		if (c.entity === 'print' && c.change === 'removed' && c.print_id)
			removedById.set(c.print_id, isObject(c.old_value) ? c.old_value : {});
	}
	// Added then removed within the window: neither new nor gone.
	const announcedAdded = new Set([...addedPrints].filter((id) => !removedById.has(id)));
	for (const id of addedPrints) removedById.delete(id);
	return { addedPrints, announcedAdded, addedDefs, removedById };
}

/**
 * Drift: a removed print and an added one on the same (set, number, lang) are the
 * same card under a re-issued Scryfall id. Both are dropped from `a`.
 */
function dropDrift(a: Additions, prints: ReadonlyMap<string, PrintRef>): void {
	const addedByTriplet = new Map<string, string>();
	for (const id of a.announcedAdded) {
		const p = prints.get(id);
		if (p) addedByTriplet.set(triplet(p.set, p.collector_number, p.lang), id);
	}
	for (const [id, row] of [...a.removedById]) {
		const key = triplet(row.set, row.collector_number, row.lang);
		const reissued = addedByTriplet.get(key);
		if (reissued === undefined) continue;
		a.removedById.delete(id);
		a.announcedAdded.delete(reissued);
		addedByTriplet.delete(key);
	}
}

/**
 * A set whose current prints were ALL added in the window is new; otherwise its
 * English prints are new cards in that set and its French ones are translations.
 */
function splitAdded(
	ids: Iterable<string>,
	prints: ReadonlyMap<string, PrintRef>,
	setPrintCounts: ReadonlyMap<string, number>
): { newSet: PrintRef[]; newCards: PrintRef[]; translations: PrintRef[] } {
	const bySet = new Map<string, PrintRef[]>();
	for (const id of ids) {
		const p = prints.get(id);
		if (!p) continue;
		const list = bySet.get(p.set) ?? [];
		list.push(p);
		bySet.set(p.set, list);
	}
	const out = {
		newSet: [] as PrintRef[],
		newCards: [] as PrintRef[],
		translations: [] as PrintRef[],
	};
	for (const [set, list] of bySet) {
		if (setPrintCounts.get(set) === list.length) out.newSet.push(...list);
		else for (const p of list) (p.lang === 'fr' ? out.translations : out.newCards).push(p);
	}
	return out;
}

interface Updates {
	highres: Map<string, PrintRef>;
	translations: Map<string, PrintRef>;
	errata: Map<string, Set<string>>;
	legalities: LegalityChange[];
	/** Entity keys with an unannounced change. */
	other: Set<string>;
}

function isHighresUpgrade(c: ChangeRow): boolean {
	return (
		c.entity === 'print' &&
		c.field === 'image_status' &&
		c.new_value === HIGHRES &&
		c.old_value !== HIGHRES
	);
}

/** A print or print-face update; updates of prints added in the window are absorbed. */
function classifyPrintUpdate(
	c: ChangeRow,
	a: Additions,
	prints: ReadonlyMap<string, PrintRef>,
	highresIds: ReadonlySet<string>,
	out: Updates
): void {
	if (!c.print_id || a.addedPrints.has(c.print_id)) return;
	const p = prints.get(c.print_id);
	if (!p) return; // gone since: nothing to name
	if (isHighresUpgrade(c)) out.highres.set(p.id, p);
	// The new HD scan comes with new image URLs: part of the same announcement.
	else if (c.field === 'image_uris' && highresIds.has(p.id)) return;
	else if (p.lang === 'fr' && c.field !== null && PRINTED_FIELDS.has(c.field))
		out.translations.set(p.id, p);
	else out.other.add(entityKey(c));
}

/** A definition or definition-face update: legalities, an oracle erratum, or other. */
function classifyDefinitionUpdate(c: ChangeRow, a: Additions, out: Updates): void {
	if (!c.oracle_id || a.addedDefs.has(c.oracle_id) || c.field === null) return;
	if (c.entity === 'definition' && c.field === 'legalities') {
		out.legalities.push(...legalityDiff(c.oracle_id, c.old_value, c.new_value));
		return;
	}
	const oracleFields = c.entity === 'definition' ? ORACLE_FIELDS : ORACLE_FACE_FIELDS;
	if (!oracleFields.has(c.field)) {
		out.other.add(entityKey(c));
		return;
	}
	const fields = out.errata.get(c.oracle_id) ?? new Set<string>();
	fields.add(c.field);
	out.errata.set(c.oracle_id, fields);
}

function classifyUpdates(
	changes: readonly ChangeRow[],
	a: Additions,
	prints: ReadonlyMap<string, PrintRef>
): Updates {
	const out: Updates = {
		highres: new Map(),
		translations: new Map(),
		errata: new Map(),
		legalities: [],
		other: new Set(),
	};
	const highresIds = new Set(changes.filter(isHighresUpgrade).map((c) => c.print_id as string));
	for (const c of changes) {
		if (c.change === 'added') continue; // prints handled apart, definitions implied
		if (c.change === 'removed') {
			if (c.entity !== 'print') out.other.add(entityKey(c)); // a face dropped from a print
		} else if (c.entity === 'print' || c.entity === 'print_face') {
			classifyPrintUpdate(c, a, prints, highresIds, out);
		} else {
			classifyDefinitionUpdate(c, a, out);
		}
	}
	return out;
}

const isRotation = (l: LegalityChange) =>
	l.format === 'standard' && l.from === 'legal' && l.to === 'not_legal';

/**
 * Splits legality changes: a format that appears (from null) or disappears (to null)
 * is one line per format, more than ROTATION_THRESHOLD cards leaving Standard is one
 * line, the rest is listed card by card.
 */
function splitLegalities(
	all: readonly LegalityChange[]
): Pick<Classified, 'legalities' | 'rotation' | 'newFormats' | 'removedFormats'> {
	const added = new Map<string, number>();
	const removed = new Set<string>();
	const perCard: LegalityChange[] = [];
	for (const l of all) {
		if (l.from === null) added.set(l.format, (added.get(l.format) ?? 0) + 1);
		else if (l.to === null) removed.add(l.format);
		else perCard.push(l);
	}
	const rotating = perCard.filter(isRotation).length;
	const rotation = rotating > ROTATION_THRESHOLD ? rotating : 0;
	return {
		legalities: rotation > 0 ? perCard.filter((l) => !isRotation(l)) : perCard,
		rotation,
		newFormats: [...added]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([format, count]) => ({ format, count })),
		removedFormats: [...removed].sort(),
	};
}

/** Sorts the window's changes into the digest's categories. */
export function classifyChanges(input: DigestInput): Classified {
	const { prints, sets, setPrintCounts } = input;
	const changes = collapseNetChanges(input.changes);

	const additions = indexAdditions(changes);
	dropDrift(additions, prints);
	const added = splitAdded(additions.announcedAdded, prints, setPrintCounts);
	const updates = classifyUpdates(changes, additions, prints);
	for (const p of added.translations) updates.translations.set(p.id, p);

	// New sets: most recent release first (the title names the first one).
	const newSets = groupBySet(added.newSet).sort((a, b) => {
		const ra = sets.get(a.set)?.released_at ?? '';
		const rb = sets.get(b.set)?.released_at ?? '';
		return (
			rb.localeCompare(ra) || b.printIds.length - a.printIds.length || a.set.localeCompare(b.set)
		);
	});

	return {
		newSets,
		newCards: groupBySet(added.newCards),
		translations: groupBySet(updates.translations.values()),
		highres: groupBySet(updates.highres.values()),
		errata: updates.errata,
		...splitLegalities(updates.legalities),
		removed: [...additions.removedById.values()],
		migrations: [...input.migrations],
		otherCorrections: updates.other.size,
	};
}

/** True when the classified window holds at least one announceable change. */
export function hasAnnounceable(c: Classified): boolean {
	return (
		c.newSets.length > 0 ||
		c.newCards.length > 0 ||
		c.translations.length > 0 ||
		c.highres.length > 0 ||
		c.errata.size > 0 ||
		c.legalities.length > 0 ||
		c.rotation > 0 ||
		c.newFormats.length > 0 ||
		c.removedFormats.length > 0 ||
		c.removed.length > 0 ||
		c.migrations.length > 0 ||
		c.otherCorrections > 0
	);
}

// --- Lines shown (shared by rendering and the oracle-print lookup) -----------------

type Names = ReadonlyMap<string, string>;

const nameOf = (names: Names, oracleId: string) => names.get(oracleId) ?? oracleId;

/** Errata lines in display order, capped at LINE_LIMIT. */
function shownErrata(c: Classified, names: Names): [string, Set<string>][] {
	return [...c.errata.entries()]
		.sort(
			([a], [b]) => nameOf(names, a).localeCompare(nameOf(names, b), 'en') || a.localeCompare(b)
		)
		.slice(0, LINE_LIMIT);
}

/** Per-card legality lines in display order, capped at LINE_LIMIT. */
function shownLegalities(c: Classified, names: Names): LegalityChange[] {
	return [...c.legalities]
		.sort(
			(a, b) =>
				nameOf(names, a.oracleId).localeCompare(nameOf(names, b.oracleId), 'en') ||
				a.format.localeCompare(b.format) ||
				a.oracleId.localeCompare(b.oracleId)
		)
		.slice(0, LINE_LIMIT);
}

/**
 * The oracles whose line is actually shown with a card link (errata and per-card
 * legalities within LINE_LIMIT): the only ones the script must resolve to a print.
 * Rotated cards and new/removed formats are summary lines and need none.
 */
export function oraclesToLink(input: DigestInput): string[] {
	const c = classifyChanges(input);
	const ids = new Set<string>();
	for (const [oracleId] of shownErrata(c, input.oracleNames)) ids.add(oracleId);
	for (const l of shownLegalities(c, input.oracleNames)) ids.add(l.oracleId);
	return [...ids];
}

// --- Rendering ---------------------------------------------------------------------

export type Locale = 'fr' | 'en';
type Values = Record<string, string | number>;
interface T {
	(key: string, values?: Values): string;
	has(key: string): boolean;
}

type CreateTranslator = (options: {
	locale: Locale;
	messages: Record<string, unknown>;
	namespace: string;
	onError: (err: unknown) => void;
}) => T;

function translator(locale: Locale): T {
	return (createTranslator as unknown as CreateTranslator)({
		locale,
		messages: { catalogDigest: locale === 'fr' ? frMessages : enMessages },
		namespace: 'catalogDigest',
		onError: (err) => {
			throw err;
		},
	});
}

/**
 * Escapes Markdown punctuation (and a `:` that could open a directive) in data
 * text. Line breaks (a multi-line Scryfall note) become a space so a list item
 * stays on one line.
 */
export function escapeMarkdown(text: string): string {
	return text
		.replace(/(\r?\n)+/g, ' ')
		.replace(/[\\`*_[\]{}<>#|~]/g, '\\$&')
		.replace(/:(?=[A-Za-z])/g, '\\:');
}

const SET_CODE_RE = /^[a-z0-9]{2,8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setLabel(code: string, sets: ReadonlyMap<string, SetRef>): string {
	return sets.get(code)?.name ?? code.toUpperCase();
}

/** `:set[Name]{code=xxx}` when the set is known, its escaped name otherwise. */
function setLink(code: string, sets: ReadonlyMap<string, SetRef>): string {
	const label = escapeMarkdown(setLabel(code, sets));
	return sets.has(code) && SET_CODE_RE.test(code) ? `:set[${label}]{code=${code}}` : label;
}

/** `:card[Name]{id=…}` when a print id is known, the escaped name otherwise. */
function cardLink(name: string, printId: string | undefined): string {
	const label = escapeMarkdown(name);
	return printId && UUID_RE.test(printId) ? `:card[${label}]{id=${printId}}` : label;
}

function grid(ids: readonly string[]): string {
	return `::cards{ids="${ids.join(',')}"}`;
}

/** A bullet list of the shown lines, then « Et N autres. » for the rest of `total`. */
function bullets(shown: readonly string[], total: number, t: T): string[] {
	if (shown.length === 0) return [];
	const list = shown.map((l) => `- ${l}`).join('\n');
	const more = total - shown.length;
	return more > 0 ? [list, t('moreLines', { count: more })] : [list];
}

function setSection(groups: readonly SetGroup[], input: DigestInput, t: T): string[] {
	const out: string[] = [];
	for (const g of groups.slice(0, SET_LIMIT)) {
		out.push(`### ${setLink(g.set, input.sets)}`);
		out.push(grid(g.printIds.slice(0, GRID_LIMIT)));
		const more = g.printIds.length - GRID_LIMIT;
		if (more > 0) {
			out.push(
				input.sets.has(g.set)
					? t('moreCards', { count: more, set: setLink(g.set, input.sets) })
					: t('moreCardsNoSet', { count: more })
			);
		}
	}
	const moreSets = groups.length - SET_LIMIT;
	if (moreSets > 0) out.push(t('moreSets', { count: moreSets }));
	return out;
}

const countCards = (groups: readonly SetGroup[]) =>
	groups.reduce((n, g) => n + g.printIds.length, 0);

function label(t: T, key: string, fallback: string): string {
	return t.has(key) ? t(key) : fallback;
}

function oracleCard(input: DigestInput, oracleId: string): string {
	return cardLink(nameOf(input.oracleNames, oracleId), input.oraclePrints.get(oracleId));
}

function title(c: Classified, input: DigestInput, t: T, locale: Locale): string {
	const setName = (g: SetGroup) => setLabel(g.set, input.sets);
	if (c.newSets.length > 0)
		return t('title.newSets', { count: c.newSets.length, name: setName(c.newSets[0]) });
	if (c.newCards.length > 0) {
		const values = { count: countCards(c.newCards), name: setName(c.newCards[0]) };
		return c.newCards.length === 1
			? t('title.newCards', values)
			: t('title.newCardsMore', { ...values, others: c.newCards.length - 1 });
	}
	if (c.translations.length > 0)
		return t('title.translations', { count: countCards(c.translations) });
	if (c.highres.length > 0) return t('title.highres', { count: countCards(c.highres) });
	const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
		input.date
	);
	return t('title.other', { date });
}

function legalitySection(c: Classified, input: DigestInput, t: T): string[] {
	const formatName = (f: string) => label(t, `formats.${f}`, f);
	const out: string[] = [];
	if (c.rotation > 0) out.push(t('rotation', { count: c.rotation }));
	for (const f of c.newFormats)
		out.push(t('newFormat', { format: formatName(f.format), count: f.count }));
	for (const f of c.removedFormats) out.push(t('removedFormat', { format: formatName(f) }));
	const lines = shownLegalities(c, input.oracleNames).map((l) =>
		t('legalityLine', {
			card: oracleCard(input, l.oracleId),
			format: formatName(l.format),
			from: label(t, `legality.${l.from}`, String(l.from)),
			to: label(t, `legality.${l.to}`, String(l.to)),
		})
	);
	out.push(...bullets(lines, c.legalities.length, t));
	return out;
}

function removedSection(c: Classified, input: DigestInput, t: T): string[] {
	const lines = c.removed
		.map((row) => {
			const oracleId = typeof row.oracle_id === 'string' ? row.oracle_id : '';
			const name = nameOf(input.oracleNames, oracleId);
			const lang = String(row.lang ?? '');
			return {
				key: `${name}|${row.set}|${row.collector_number}|${lang}`,
				line: t('removedLine', {
					name: escapeMarkdown(name),
					set: escapeMarkdown(String(row.set ?? '').toUpperCase()),
					number: escapeMarkdown(String(row.collector_number ?? '')),
					lang: label(t, `languages.${lang}`, lang),
				}),
			};
		})
		.sort((a, b) => a.key.localeCompare(b.key, 'en'))
		.slice(0, LINE_LIMIT)
		.map((r) => r.line);
	return bullets(lines, c.removed.length, t);
}

function migrationLine(m: MigrationRow, input: DigestInput, t: T): string {
	const meta = m.metadata ?? {};
	const oldName = typeof meta.name === 'string' ? meta.name : null;
	const old =
		oldName === null
			? t('migrationOldUnknown', { id: m.old_scryfall_id })
			: t('migrationOld', {
					name: escapeMarkdown(oldName),
					set: escapeMarkdown(String(meta.set_code ?? '?').toUpperCase()),
					number: escapeMarkdown(String(meta.collector_number ?? '?')),
				});
	let line: string;
	if (m.strategy === 'merge' && m.new_scryfall_id) {
		// A target missing from the catalog is named, never linked.
		const target = input.prints.get(m.new_scryfall_id);
		const card = target
			? cardLink(target.name ?? oldName ?? target.id, target.id)
			: escapeMarkdown(oldName ?? m.new_scryfall_id);
		line = t('migrationMerge', { old, card });
	} else {
		line = t('migrationDelete', { old });
	}
	return m.note ? t('withNote', { line, note: escapeMarkdown(m.note) }) : line;
}

function body(c: Classified, input: DigestInput, t: T): string {
	const blocks: string[] = [t('intro')];
	const section = (key: string, content: string[]) => {
		if (content.length === 0) return;
		const heading = t(`sections.${key}`);
		blocks.push(`## ${heading}`, ...content);
	};

	// Same priority order as the title: the headline event comes first.
	section('newSets', setSection(c.newSets, input, t));
	section('newCards', setSection(c.newCards, input, t));
	section('translations', setSection(c.translations, input, t));
	section('highres', setSection(c.highres, input, t));

	const errata = shownErrata(c, input.oracleNames).map(([oracleId, fields]) =>
		t('errataLine', {
			card: oracleCard(input, oracleId),
			fields: [...fields]
				.sort()
				.map((f) => label(t, `fields.${f}`, f))
				.join(', '),
		})
	);
	section('errata', bullets(errata, c.errata.size, t));
	section('legalities', legalitySection(c, input, t));
	section('removed', removedSection(c, input, t));

	const migrations = [...c.migrations]
		.sort(
			(a, b) =>
				b.performed_at.localeCompare(a.performed_at) ||
				a.old_scryfall_id.localeCompare(b.old_scryfall_id)
		)
		.slice(0, LINE_LIMIT)
		.map((m) => migrationLine(m, input, t));
	section('migrations', bullets(migrations, c.migrations.length, t));

	if (c.otherCorrections > 0)
		section('otherCorrections', [t('otherCorrections', { count: c.otherCorrections })]);

	return blocks.join('\n\n') + '\n';
}

/** `catalogue-YYYY-MM-DD` (UTC). The database adds -2, -3… when it is taken. */
export function digestSlug(date: Date): string {
	return `catalogue-${date.toISOString().slice(0, 10)}`;
}

/** Builds the fr/en article, or null when the window has nothing to announce. */
export function buildCatalogDigest(input: DigestInput): DigestArticle | null {
	const c = classifyChanges(input);
	if (!hasAnnounceable(c)) return null;
	const fr = translator('fr');
	const en = translator('en');
	return {
		slug: digestSlug(input.date),
		title_fr: title(c, input, fr, 'fr'),
		title_en: title(c, input, en, 'en'),
		body_fr: body(c, input, fr),
		body_en: body(c, input, en),
	};
}

/**
 * The ids the script must resolve before building (no I/O here): every print the
 * window cites, and the oracles that get a named line (errata, per-card legalities,
 * removed prints). Oracles only touched by a new/removed format, a rotation or
 * `oldschool` are left out.
 */
export function referencedIds(
	changes: readonly ChangeRow[],
	migrations: readonly MigrationRow[]
): { printIds: string[]; oracleIds: string[] } {
	const printIds = new Set<string>();
	for (const c of changes) {
		if ((c.entity === 'print' || c.entity === 'print_face') && c.print_id && c.change !== 'removed')
			printIds.add(c.print_id);
	}
	for (const m of migrations) if (m.new_scryfall_id) printIds.add(m.new_scryfall_id);

	// Definition-level classification needs no reference data.
	const c = classifyChanges({
		changes,
		migrations: [],
		prints: new Map(),
		oracleNames: new Map(),
		oraclePrints: new Map(),
		sets: new Map(),
		setPrintCounts: new Map(),
		date: new Date(0),
	});
	const oracleIds = new Set<string>(c.errata.keys());
	for (const l of c.legalities) oracleIds.add(l.oracleId);
	for (const row of c.removed) if (typeof row.oracle_id === 'string') oracleIds.add(row.oracle_id);
	return { printIds: [...printIds], oracleIds: [...oracleIds] };
}
