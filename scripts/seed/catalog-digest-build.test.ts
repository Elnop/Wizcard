import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCitations } from '../../src/lib/articles/directives';
import {
	GRID_LIMIT,
	buildCatalogDigest,
	classifyChanges,
	digestSlug,
	escapeMarkdown,
	LINE_LIMIT,
	legalityDiff,
	oraclesToLink,
	referencedIds,
	type ChangeRow,
	type DigestInput,
	type MigrationRow,
	type PrintRef,
	type SetRef,
} from './catalog-digest-build';

// --- Fixtures ------------------------------------------------------------------------

const DATE = new Date('2026-10-26T05:12:00Z');

/** Deterministic UUID from a number (v4 shape, lowercase). */
function uuid(n: number, prefix = 'a'): string {
	const hex = n.toString(16).padStart(12, '0');
	return `${prefix.repeat(8)}-0000-4000-8000-${hex}`;
}

let nextId = 1;
function change(row: Partial<ChangeRow> & Pick<ChangeRow, 'entity' | 'change'>): ChangeRow {
	return {
		id: nextId++,
		print_id: null,
		oracle_id: null,
		face_index: null,
		field: null,
		old_value: null,
		new_value: null,
		...row,
	};
}

function print(n: number, set: string, lang = 'en', name = `Card ${n}`): PrintRef {
	return {
		id: uuid(n),
		oracle_id: uuid(n, 'b'),
		set,
		collector_number: String(n),
		lang,
		name,
	};
}

const SETS: SetRef[] = [
	{ code: 'fdn', name: 'Foundations', released_at: '2024-11-15' },
	{ code: 'dsk', name: 'Duskmourn: House of Horror', released_at: '2024-09-27' },
	{ code: 'mkm', name: 'Murders at Karlov Manor', released_at: '2024-02-09' },
];

function input(
	changes: ChangeRow[],
	opts: {
		prints?: PrintRef[];
		migrations?: MigrationRow[];
		setPrintCounts?: Record<string, number>;
		oracleNames?: Record<string, string>;
		oraclePrints?: Record<string, string>;
	} = {}
): DigestInput {
	return {
		changes,
		migrations: opts.migrations ?? [],
		prints: new Map((opts.prints ?? []).map((p) => [p.id, p])),
		oracleNames: new Map(Object.entries(opts.oracleNames ?? {})),
		oraclePrints: new Map(Object.entries(opts.oraclePrints ?? {})),
		sets: new Map(SETS.map((s) => [s.code, s])),
		setPrintCounts: new Map(Object.entries(opts.setPrintCounts ?? {})),
		date: DATE,
	};
}

const added = (p: PrintRef) =>
	change({ entity: 'print', change: 'added', print_id: p.id, oracle_id: p.oracle_id });

const legalityUpdate = (oracle: string, from: Record<string, string>, to: Record<string, string>) =>
	change({
		entity: 'definition',
		change: 'updated',
		oracle_id: oracle,
		field: 'legalities',
		old_value: from,
		new_value: to,
	});

/**
 * The body, parsed like the article page parses it, cites exactly these print ids
 * and set codes (first-seen order), so every emitted directive is valid.
 */
function assertCitations(markdown: string, printIds: string[], setCodes: string[] = []): void {
	assert.deepEqual(extractCitations(markdown), { printIds, setCodes });
}

const updated = (row: Omit<Partial<ChangeRow>, 'change'> & Pick<ChangeRow, 'entity'>) =>
	change({ change: 'updated', ...row });

// --- Matrix ----------------------------------------------------------------------------

test('nothing new: no article', () => {
	assert.equal(buildCatalogDigest(input([])), null);
});

test('new set: title, grid of 12, "and 288 more" with a set link', () => {
	const prints = Array.from({ length: 300 }, (_, i) => print(i + 1, 'fdn'));
	const article = buildCatalogDigest(
		input(prints.map(added), { prints, setPrintCounts: { fdn: 300 } })
	);
	assert.ok(article);
	assert.equal(article.title_fr, 'Nouveau set : Foundations');
	assert.equal(article.title_en, 'New set: Foundations');
	assert.match(article.body_fr, /^## Nouveaux sets$/m);
	assert.match(article.body_fr, /^### :set\[Foundations\]\{code=fdn\}$/m);
	assert.match(article.body_fr, /Et 288 autres cartes dans :set\[Foundations\]\{code=fdn\}\./);
	assert.match(article.body_en, /And 288 more cards in :set\[Foundations\]\{code=fdn\}\./);
	assertCitations(
		article.body_fr,
		prints.slice(0, GRID_LIMIT).map((p) => p.id),
		['fdn']
	);
	assert.equal(article.slug, 'catalogue-2026-10-26');
	// Sections start at ##: no level-1 heading.
	assert.doesNotMatch(article.body_fr, /^# /m);
});

test('several types: new cards in the title, HD and legality sections', () => {
	const fdnExisting = 100;
	const newPrints = Array.from({ length: 5 }, (_, i) => print(i + 1, 'fdn'));
	const hd = Array.from({ length: 40 }, (_, i) => print(1000 + i, 'dsk'));
	const banned = uuid(9000, 'c');
	const changes = [
		...newPrints.map(added),
		...hd.map((p) =>
			change({
				entity: 'print',
				change: 'updated',
				print_id: p.id,
				oracle_id: p.oracle_id,
				field: 'image_status',
				old_value: 'lowres',
				new_value: 'highres_scan',
			})
		),
		legalityUpdate(
			banned,
			{ modern: 'legal', oldschool: 'legal' },
			{ modern: 'banned', oldschool: 'not_legal' }
		),
	];
	const article = buildCatalogDigest(
		input(changes, {
			prints: [...newPrints, ...hd],
			setPrintCounts: { fdn: fdnExisting + 5 },
			oracleNames: { [banned]: 'Grief' },
			oraclePrints: { [banned]: uuid(9000) },
		})
	);
	assert.ok(article);
	assert.equal(article.title_fr, '5 nouvelles cartes dans Foundations');
	assert.equal(article.title_en, '5 new cards in Foundations');
	assert.match(article.body_fr, /^## Nouvelles cartes$/m);
	assert.match(article.body_fr, /^## Images HD$/m);
	assert.match(article.body_fr, /Et 28 autres cartes dans :set\[Duskmourn: House of Horror\]/);
	assert.match(article.body_fr, /^## Légalités$/m);
	assert.match(
		article.body_fr,
		new RegExp(`^- :card\\[Grief\\]\\{id=${uuid(9000)}\\} — Modern : légale → bannie$`, 'm')
	);
	assert.match(article.body_en, /— Modern: legal → banned$/m);
	assert.doesNotMatch(article.body_fr, /Old ?School|oldschool/i);
	const cited = [
		...newPrints.map((p) => p.id),
		...hd.slice(0, GRID_LIMIT).map((p) => p.id),
		uuid(9000),
	];
	assertCitations(article.body_fr, cited, ['fdn', 'dsk']);
	assertCitations(article.body_en, cited, ['fdn', 'dsk']);
});

test('rotation: more than 20 cards leaving Standard become one line', () => {
	const oracles = Array.from({ length: 150 }, (_, i) => uuid(i + 1, 'c'));
	const changes = oracles.map((o) =>
		legalityUpdate(o, { standard: 'legal' }, { standard: 'not_legal' })
	);
	const article = buildCatalogDigest(input(changes));
	assert.ok(article);
	assert.match(article.body_fr, /^150 cartes quittent le Standard\.$/m);
	assert.match(article.body_en, /^150 cards leave Standard\.$/m);
	assert.doesNotMatch(article.body_fr, /^- /m);
});

test('rotation: 20 cards or fewer are listed card by card', () => {
	const oracles = Array.from({ length: 20 }, (_, i) => uuid(i + 1, 'c'));
	const c = classifyChanges(
		input(oracles.map((o) => legalityUpdate(o, { standard: 'legal' }, { standard: 'not_legal' })))
	);
	assert.equal(c.rotation, 0);
	assert.equal(c.legalities.length, 20);
});

test('Old School only: nothing announceable, no article', () => {
	const changes = [
		legalityUpdate(
			uuid(1, 'c'),
			{ oldschool: 'legal', modern: 'legal' },
			{ oldschool: 'not_legal', modern: 'legal' }
		),
	];
	assert.equal(buildCatalogDigest(input(changes)), null);
	assert.deepEqual(legalityDiff('x', { oldschool: 'legal' }, { oldschool: 'banned' }), []);
});

test('drift: removed + added on the same triplet appears nowhere', () => {
	const fresh = print(7, 'mkm');
	const gone = {
		id: uuid(70),
		oracle_id: fresh.oracle_id,
		set: 'mkm',
		collector_number: '7',
		lang: 'en',
	};
	const changes = [
		change({ entity: 'print', change: 'removed', print_id: gone.id, old_value: gone }),
		added(fresh),
	];
	const c = classifyChanges(input(changes, { prints: [fresh], setPrintCounts: { mkm: 300 } }));
	assert.equal(c.newCards.length, 0);
	assert.equal(c.removed.length, 0);
	assert.equal(
		buildCatalogDigest(input(changes, { prints: [fresh], setPrintCounts: { mkm: 300 } })),
		null
	);
});

test('a removed print without a re-issued twin is listed', () => {
	const gone = {
		id: uuid(70),
		oracle_id: uuid(1, 'c'),
		set: 'mkm',
		collector_number: '7',
		lang: 'fr',
	};
	const article = buildCatalogDigest(
		input([change({ entity: 'print', change: 'removed', print_id: gone.id, old_value: gone })], {
			oracleNames: { [uuid(1, 'c')]: 'Lightning Bolt' },
		})
	);
	assert.ok(article);
	assert.match(article.body_fr, /^- Lightning Bolt \(MKM n° 7, français\)$/m);
	assert.match(article.body_en, /^- Lightning Bolt \(MKM #7, French\)$/m);
});

test('migration merge: old name (set number) -> new card link + note', () => {
	const target = print(42, 'znr', 'en', 'Oran-Rief Ooze');
	const merge: MigrationRow = {
		id: uuid(1, 'd'),
		strategy: 'merge',
		old_scryfall_id: uuid(2, 'd'),
		new_scryfall_id: target.id,
		note: 'Rebalanced cards have been removed from Arena',
		performed_at: '2026-09-23',
		metadata: { name: 'A-Oran-Rief Ooze', set_code: 'znr', collector_number: 'A-198' },
		recorded_at: '2026-10-20T18:12:46.591403+00:00',
	};
	const del: MigrationRow = {
		...merge,
		id: uuid(3, 'd'),
		strategy: 'delete',
		new_scryfall_id: null,
		note: 'Mapped to wrong Beast',
		metadata: { name: 'Beast', set_code: 'tm19', collector_number: '1' },
		performed_at: '2026-09-18',
	};
	const article = buildCatalogDigest(input([], { migrations: [merge, del], prints: [target] }));
	assert.ok(article);
	assert.equal(article.title_fr, 'Catalogue : mises à jour du 26 octobre 2026');
	assert.equal(article.title_en, 'Catalog: updates of October 26, 2026');
	assert.match(
		article.body_fr,
		new RegExp(
			`^- A-Oran-Rief Ooze \\(ZNR n° A-198\\) → :card\\[Oran-Rief Ooze\\]\\{id=${target.id}\\} — Rebalanced cards have been removed from Arena$`,
			'm'
		)
	);
	assert.match(article.body_fr, /^- Beast \(TM19 n° 1\) : supprimée — Mapped to wrong Beast$/m);
	assertCitations(article.body_fr, [target.id]);
});

test('French translations: fr prints added to an existing set, printed_* on fr prints', () => {
	const frAdded = print(1, 'dsk', 'fr');
	const frUpdated = print(2, 'mkm', 'fr');
	const enUpdated = print(3, 'mkm', 'en');
	const changes = [
		added(frAdded),
		change({
			entity: 'print',
			change: 'updated',
			print_id: frUpdated.id,
			field: 'printed_text',
			old_value: null,
			new_value: 'Texte',
		}),
		change({
			entity: 'print',
			change: 'updated',
			print_id: enUpdated.id,
			field: 'printed_text',
			old_value: null,
			new_value: 'Text',
		}),
	];
	const inp = input(changes, {
		prints: [frAdded, frUpdated, enUpdated],
		setPrintCounts: { dsk: 500 },
	});
	const c = classifyChanges(inp);
	assert.equal(c.translations.length, 2);
	assert.equal(c.otherCorrections, 1);
	const article = buildCatalogDigest(inp);
	assert.ok(article);
	assert.equal(article.title_fr, '2 nouvelles traductions françaises');
	assert.match(article.body_fr, /^1 autre correction/m);
});

test('errata: oracle fields other than legalities, grouped per card', () => {
	const oracle = uuid(5, 'c');
	const changes = [
		change({
			entity: 'definition',
			change: 'updated',
			oracle_id: oracle,
			field: 'oracle_text',
			old_value: 'a',
			new_value: 'b',
		}),
		change({
			entity: 'definition_face',
			change: 'updated',
			oracle_id: oracle,
			face_index: 1,
			field: 'type_line',
			old_value: 'a',
			new_value: 'b',
		}),
	];
	const article = buildCatalogDigest(
		input(changes, {
			oracleNames: { [oracle]: 'Delver of Secrets' },
			oraclePrints: { [oracle]: uuid(5) },
		})
	);
	assert.ok(article);
	assert.match(article.body_fr, /^## Errata d'oracle$/m);
	assert.match(
		article.body_fr,
		new RegExp(`^- :card\\[Delver of Secrets\\]\\{id=${uuid(5)}\\} : texte, type$`, 'm')
	);
	assertCitations(article.body_fr, [uuid(5)]);
});

test('updates of a print added in the same window are absorbed', () => {
	const p = print(1, 'fdn');
	const changes = [
		added(p),
		change({
			entity: 'print',
			change: 'updated',
			print_id: p.id,
			field: 'image_status',
			old_value: 'lowres',
			new_value: 'highres_scan',
		}),
	];
	const c = classifyChanges(input(changes, { prints: [p], setPrintCounts: { fdn: 1 } }));
	assert.equal(c.newSets.length, 1);
	assert.equal(c.highres.length, 0);
	assert.equal(c.otherCorrections, 0);
});

test('more than 10 sets: "and N more sets"', () => {
	const prints = Array.from({ length: 13 }, (_, i) => print(i + 1, `s${i + 10}`));
	const article = buildCatalogDigest(
		input(prints.map(added), {
			prints,
			setPrintCounts: Object.fromEntries(prints.map((p) => [p.set, 99])),
		})
	);
	assert.ok(article);
	assert.equal(article.title_fr, '13 nouvelles cartes dans S10 et 12 autres sets');
	assert.equal(article.title_en, '13 new cards in S10 and 12 other sets');
	assert.match(article.body_fr, /^Et 3 autres sets\.$/m);
	assert.equal((article.body_fr.match(/^### /gm) ?? []).length, 10);
});

test('escaping keeps data text from becoming Markdown or a directive', () => {
	assert.equal(
		escapeMarkdown('Kongming, [Sleeping] *Dragon*'),
		'Kongming, \\[Sleeping\\] \\*Dragon\\*'
	);
	assert.equal(escapeMarkdown('see :card[x]'), 'see \\:card\\[x\\]');
	assert.equal(escapeMarkdown('Ratio 2:1'), 'Ratio 2:1');
});

test('slug is catalogue-YYYY-MM-DD in UTC', () => {
	assert.equal(digestSlug(new Date('2026-10-26T23:59:59-05:00')), 'catalogue-2026-10-27');
});

test('referencedIds lists the prints and oracles to resolve', () => {
	const p = print(1, 'fdn');
	const gone = { oracle_id: uuid(2, 'c') };
	const ids = referencedIds(
		[
			added(p),
			change({ entity: 'print', change: 'removed', print_id: uuid(9), old_value: gone }),
			legalityUpdate(uuid(3, 'c'), { modern: 'legal' }, { modern: 'banned' }),
			// A new format alone needs no name.
			legalityUpdate(uuid(4, 'c'), {}, { newfmt: 'legal' }),
		],
		[
			{
				id: uuid(1, 'd'),
				strategy: 'merge',
				old_scryfall_id: uuid(5),
				new_scryfall_id: uuid(6),
				note: null,
				performed_at: '2026-01-01',
				metadata: null,
				recorded_at: '2026-01-01T00:00:00+00:00',
			},
		]
	);
	assert.deepEqual(ids.printIds.sort(), [p.id, uuid(6)].sort());
	assert.deepEqual(ids.oracleIds.sort(), [uuid(2, 'c'), uuid(3, 'c')].sort());
});

test('2+ new sets: the title names the most recent release', () => {
	const prints = [print(1, 'mkm'), print(2, 'fdn'), print(3, 'fdn'), print(4, 'dsk')];
	const article = buildCatalogDigest(
		input(prints.map(added), { prints, setPrintCounts: { mkm: 1, fdn: 2, dsk: 1 } })
	);
	assert.ok(article);
	assert.equal(article.title_fr, '3 nouveaux sets, dont Foundations');
	assert.equal(article.title_en, '3 new sets, including Foundations');
});

test('more than 50 lines: 50 bullets then "and 1 more"', () => {
	const n = LINE_LIMIT + 1;
	const oracles = Array.from({ length: n }, (_, i) => uuid(i + 1, 'c'));
	const changes = oracles.map((o) =>
		updated({
			entity: 'definition',
			oracle_id: o,
			field: 'oracle_text',
			old_value: 'a',
			new_value: 'b',
		})
	);
	const names = Object.fromEntries(
		oracles.map((o, i) => [o, `Card ${String(i).padStart(3, '0')}`])
	);
	const prints = Object.fromEntries(oracles.map((o, i) => [o, uuid(i + 1)]));
	const inp = input(changes, { oracleNames: names, oraclePrints: prints });
	const article = buildCatalogDigest(inp);
	assert.ok(article);
	assert.equal((article.body_fr.match(/^- /gm) ?? []).length, LINE_LIMIT);
	assert.match(article.body_fr, /^Et 1 autre\.$/m);
	assert.match(article.body_en, /^And 1 more\.$/m);
	// Only the shown lines need a representative print.
	assert.deepEqual(oraclesToLink(inp).sort(), oracles.slice(0, LINE_LIMIT).sort());
	assertCitations(
		article.body_fr,
		oracles.slice(0, LINE_LIMIT).map((_, i) => uuid(i + 1))
	);
});

test('only other corrections: an article is still published', () => {
	const p = print(1, 'mkm');
	const article = buildCatalogDigest(
		input(
			[
				updated({ entity: 'print', print_id: p.id, field: 'mtgo_id', old_value: 1, new_value: 2 }),
				updated({
					entity: 'print',
					print_id: p.id,
					field: 'tcgplayer_id',
					old_value: 1,
					new_value: 2,
				}),
			],
			{ prints: [p] }
		)
	);
	assert.ok(article);
	assert.equal(article.title_fr, 'Catalogue : mises à jour du 26 octobre 2026');
	// Counted per distinct entity, not per field.
	assert.match(article.body_fr, /^1 autre correction /m);
});

test('a new or removed format is one line per format, no card listed', () => {
	const oracles = Array.from({ length: 30 }, (_, i) => uuid(i + 1, 'c'));
	const changes = [
		...oracles.map((o) =>
			legalityUpdate(o, { modern: 'legal' }, { modern: 'legal', premodern: 'legal' })
		),
		legalityUpdate(uuid(99, 'c'), { tlr: 'legal' }, {}),
	];
	const inp = input(changes);
	const c = classifyChanges(inp);
	assert.deepEqual(c.newFormats, [{ format: 'premodern', count: 30 }]);
	assert.deepEqual(c.removedFormats, ['tlr']);
	assert.equal(c.legalities.length, 0);
	assert.deepEqual(oraclesToLink(inp), []);
	assert.deepEqual(referencedIds(changes, []).oracleIds, []);
	const article = buildCatalogDigest(inp);
	assert.ok(article);
	assert.match(article.body_fr, /^Nouveau format Premodern : 30 cartes$/m);
	assert.match(article.body_fr, /^Format retiré TLR$/m);
	assert.match(article.body_en, /^New format Premodern: 30 cards$/m);
	assert.doesNotMatch(article.body_fr, /^- /m);
});

test('net-zero changes across seeds are dropped; chains keep first old / last new', () => {
	const o = uuid(1, 'c');
	const zero = [
		legalityUpdate(o, { modern: 'legal' }, { modern: 'banned' }),
		legalityUpdate(o, { modern: 'banned' }, { modern: 'legal' }),
	];
	assert.equal(buildCatalogDigest(input(zero)), null);
	const chain = [
		legalityUpdate(o, { modern: 'legal' }, { modern: 'restricted' }),
		legalityUpdate(o, { modern: 'restricted' }, { modern: 'banned' }),
	];
	assert.deepEqual(classifyChanges(input(chain)).legalities, [
		{ oracleId: o, format: 'modern', from: 'legal', to: 'banned' },
	]);
});

test('only ORACLE_FIELDS are errata; layout, reserved, keywords… are corrections', () => {
	const o = uuid(1, 'c');
	const changes = ['layout', 'reserved', 'keywords', 'cmc'].map((field) =>
		updated({ entity: 'definition', oracle_id: o, field, old_value: 'a', new_value: 'b' })
	);
	changes.push(
		updated({
			entity: 'definition_face',
			oracle_id: o,
			face_index: 0,
			field: 'colors',
			old_value: ['R'],
			new_value: ['G'],
		})
	);
	const c = classifyChanges(input(changes));
	assert.equal(c.errata.size, 0);
	assert.equal(c.otherCorrections, 2); // the definition and its face
});

test('an HD upgrade does not also count its image_uris as a correction', () => {
	const p = print(1, 'dsk');
	const c = classifyChanges(
		input(
			[
				updated({
					entity: 'print',
					print_id: p.id,
					field: 'image_status',
					old_value: 'lowres',
					new_value: 'highres_scan',
				}),
				updated({
					entity: 'print',
					print_id: p.id,
					field: 'image_uris',
					old_value: { a: 1 },
					new_value: { a: 2 },
				}),
			],
			{ prints: [p] }
		)
	);
	assert.equal(c.highres.length, 1);
	assert.equal(c.otherCorrections, 0);
});

test('a merge target missing from the catalog is named, not linked; notes stay on one line', () => {
	const merge: MigrationRow = {
		id: uuid(1, 'd'),
		strategy: 'merge',
		old_scryfall_id: uuid(2, 'd'),
		new_scryfall_id: uuid(3, 'd'),
		note: 'First line\nsecond line\r\n\r\nthird',
		performed_at: '2026-09-23',
		metadata: { name: 'Old Card', set_code: 'znr', collector_number: '1' },
		recorded_at: '2026-10-20T18:12:46.591403+00:00',
	};
	const article = buildCatalogDigest(input([], { migrations: [merge] }));
	assert.ok(article);
	assert.match(
		article.body_fr,
		/^- Old Card \(ZNR n° 1\) → Old Card — First line second line third$/m
	);
	assertCitations(article.body_fr, []);
});

test('names with Markdown punctuation stay valid directive labels', () => {
	const tricky = print(1, 'tst', 'en', 'Kongming, [Sleeping] *Dragon*: Reborn');
	const oracle = uuid(7, 'c');
	const base = input(
		[
			added(tricky),
			updated({
				entity: 'definition',
				oracle_id: oracle,
				field: 'name',
				old_value: 'a',
				new_value: 'b',
			}),
		],
		{
			prints: [tricky],
			setPrintCounts: { tst: 5 },
			oracleNames: { [oracle]: 'Who // What [x]:y' },
			oraclePrints: { [oracle]: uuid(7) },
		}
	);
	const article = buildCatalogDigest({
		...base,
		sets: new Map([['tst', { code: 'tst', name: 'Set [Odd]: *Name*', released_at: null }]]),
	});
	assert.ok(article);
	assertCitations(article.body_fr, [tricky.id, uuid(7)], ['tst']);
	assert.match(article.body_fr, /:set\[Set \\\[Odd\\\]: \\\*Name\\\*\]\{code=tst\}/);
	assert.match(article.body_fr, /:card\[Who \/\/ What \\\[x\\\]\\:y\]\{id=/);
});

test('escapeMarkdown collapses line breaks', () => {
	assert.equal(escapeMarkdown('a\nb\r\n\r\nc'), 'a b c');
});
