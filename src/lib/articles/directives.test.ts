import { test } from 'node:test';
import assert from 'node:assert/strict';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import {
	ARTICLE_SYNTAX_PLUGINS,
	extractCitations,
	normalizePrintId,
	normalizeSetCode,
	parseArticleBody,
	remarkArticleDirectives,
	resolveCitationsWith,
} from './directives';
import { markdownExcerpt } from './article';

const A = '0000579f-7b35-4ed3-b44c-db2a538066fe';
const B = '00006596-1166-4a79-8443-ca9f82e6db4e';
const C = '0000a54c-a511-4925-92dc-01b937f9afad';
const D = '0000cd57-91fe-411f-b798-646e965eec37';
const E = '00012bd8-ed68-4978-a22d-f450c8a6e048';

type Node = ReturnType<typeof parseArticleBody>;

/** Text of the rendered tree (text node values only). */
function textOf(node: Node): string {
	if (typeof node.value === 'string') return node.value;
	return (node.children ?? []).map(textOf).join('');
}

function find(node: Node, pred: (n: Node) => boolean): Node[] {
	const out = pred(node) ? [node] : [];
	for (const c of node.children ?? []) out.push(...find(c, pred));
	return out;
}

const tagged = (tree: Node) => find(tree, (n) => n.data?.hName !== undefined);

test('normalizePrintId accepts UUIDs (lowercased), rejects anything else', () => {
	assert.equal(normalizePrintId(` ${A.toUpperCase()} `), A);
	for (const bad of ['', 'zzz', `${A}x`, 'mpc:abc']) assert.equal(normalizePrintId(bad), null, bad);
});

test('normalizeSetCode accepts short alphanumerics (lowercased), rejects anything else', () => {
	assert.equal(normalizeSetCode('FDN'), 'fdn');
	assert.equal(normalizeSetCode('30a'), '30a');
	for (const bad of ['', 'x', 'f-dn', 'a,b', 'toolongcode', 'fdn)']) {
		assert.equal(normalizeSetCode(bad), null, bad);
	}
});

test('grid: ::cards keeps the ids in order', () => {
	const tree = parseArticleBody(`::cards{ids="${A},${B}"}`);
	const [grid] = tagged(tree);
	assert.equal(grid.data?.hName, 'div');
	assert.deepEqual(grid.data?.hProperties, { dataWzCards: `${A},${B}` });
});

test('partial grid: invalid ids are dropped, valid ones kept in order', () => {
	const tree = parseArticleBody(`::cards{ids="${A}, zzz ,${C}"}`);
	assert.deepEqual(tagged(tree)[0].data?.hProperties, { dataWzCards: `${A},${C}` });
});

test('card link: :card[label]{id} becomes a tagged span with its label', () => {
	const tree = parseArticleBody(`See :card[Bolt]{id=${A}} now`);
	const [span] = tagged(tree);
	assert.equal(span.data?.hName, 'span');
	assert.deepEqual(span.data?.hProperties, { dataWzCard: A });
	assert.equal(textOf(span), 'Bolt');
	assert.equal(textOf(tree), 'See Bolt now');
});

test('set link: :set[label]{code} becomes a tagged span (code lowercased)', () => {
	const tree = parseArticleBody(':set[Foundations]{code=FDN}');
	const [span] = tagged(tree);
	assert.deepEqual(span.data?.hProperties, { dataWzSet: 'fdn' });
	assert.equal(textOf(span), 'Foundations');
});

const VIDEO = '::video{src=x}';
const FOO = 'a :foo[bar] b';
const NOTE = ':::note\ninside\n:::';

test('unknown directives render as their source text', () => {
	for (const md of [VIDEO, FOO, NOTE]) {
		const tree = parseArticleBody(md);
		assert.equal(tagged(tree).length, 0, md);
		assert.equal(
			find(tree, (n) => n.type.endsWith('Directive')).length,
			0,
			`no directive node left: ${md}`
		);
	}
	assert.equal(textOf(parseArticleBody(VIDEO)), VIDEO);
	assert.equal(textOf(parseArticleBody(FOO)), FOO);
	assert.equal(textOf(parseArticleBody(NOTE)), ':::noteinside:::');
});

test('malformed directives render as their source text', () => {
	for (const md of [
		'::cards',
		'::cards{ids=""}',
		'::cards{ids="zzz,yyy"}',
		'::cards{other=x}',
		`:card{id=${A}}`,
		`:card[]{id=${A}}`,
		':set{code=fdn}',
		`::card{id=${A}}`,
		`:cards[x]{ids=${A}}`,
	]) {
		const tree = parseArticleBody(md);
		assert.equal(tagged(tree).length, 0, md);
		assert.equal(textOf(tree), md, md);
	}
});

test('labelled :card/:set with a malformed id/code render their label alone', () => {
	for (const [md, label] of [
		[':card[Bolt]{id=zzz}', 'Bolt'],
		[':card[Bolt]', 'Bolt'],
		[':card[Bolt]{id=""}', 'Bolt'],
		[':set[X]{code=""}', 'X'],
		[':set[X]{code="f-dn"}', 'X'],
		[':set[*Big* X]', 'Big X'],
	]) {
		const tree = parseArticleBody(`a ${md} b`);
		assert.equal(tagged(tree).length, 0, md);
		assert.equal(textOf(tree), `a ${label} b`, md);
	}
	assert.deepEqual(extractCitations(':card[Bolt]{id=zzz} :set[X]{code=f-dn}'), {
		printIds: [],
		setCodes: [],
	});
});

test('no nested links: :card/:set inside a link render their label only', () => {
	const tree = parseArticleBody(
		`[see :card[Bolt]{id=${A}} and :set[F]{code=fdn}](https://x.y) [ref :card[C]{id=${B}}][r]\n\n[r]: https://r.s`
	);
	assert.equal(tagged(tree).length, 0);
	assert.equal(find(tree, (n) => n.type === 'link').length, 1);
	assert.equal(textOf(tree), 'see Bolt and F ref C');
});

test('no nested links: links inside a :card/:set label flatten to their text', () => {
	const tree = parseArticleBody(
		`:card[a [b](https://x.y) c]{id=${A}} :set[see https://x.y now]{code=fdn} :set[:card[X]{id=${B}}]{code=m21}`
	);
	const spans = tagged(tree);
	assert.deepEqual(
		spans.map((n) => n.data?.hProperties),
		[{ dataWzCard: A }, { dataWzSet: 'fdn' }, { dataWzSet: 'm21' }]
	);
	assert.equal(find(tree, (n) => n.type === 'link' || n.type === 'linkReference').length, 0);
	assert.deepEqual(spans.map(textOf), ['a b c', 'see https://x.y now', 'X']);
});

test('real pipeline: the plugin reads the source from the VFile', async () => {
	const md = `Ratio 2:1\n\n::video{src=x}\n\n:card[Bolt]{id=${A}}`;
	const processor = unified()
		.use(remarkParse)
		.use(ARTICLE_SYNTAX_PLUGINS)
		.use(remarkArticleDirectives);
	const tree = (await processor.run(processor.parse(md), md)) as unknown as Node;
	const paragraphs = tree.children ?? [];
	assert.equal(textOf(paragraphs[0]), 'Ratio 2:1');
	assert.equal(textOf(paragraphs[1]), '::video{src=x}');
	assert.deepEqual(tagged(tree)[0].data?.hProperties, { dataWzCard: A });
	assert.equal(textOf(tagged(tree)[0]), 'Bolt');
});

test('false positives stay unchanged', () => {
	for (const md of ['Ratio 2:1', 'At 12:30 sharp', 'Note:important here']) {
		const tree = parseArticleBody(md);
		assert.equal(tagged(tree).length, 0, md);
		// rendered as ONE text node, exactly as written
		assert.deepEqual(
			tree.children?.[0].children?.map((n) => n.value),
			[md],
			md
		);
	}
	assert.equal(textOf(parseArticleBody('Go https://x.y now')), 'Go https://x.y now');
	assert.deepEqual(extractCitations('Ratio 2:1 at 12:30, https://x.y'), {
		printIds: [],
		setCodes: [],
	});
});

test('directives in code are not parsed', () => {
	assert.deepEqual(
		extractCitations(`\`:card[x]{id=${A}}\`\n\n\`\`\`\n::cards{ids="${B}"}\n\`\`\``),
		{
			printIds: [],
			setCodes: [],
		}
	);
});

test('extractCitations: deduplicated, first-seen order, valid directives only', () => {
	const md = [
		`::cards{ids="${A},${B},${C}"}`,
		'',
		`Then :card[x]{id=${D}} and :card[y]{id=${A.toUpperCase()}}, :set[F]{code=fdn} :set[G]{code=FDN}`,
		'',
		`- :card[z]{id=${E}} in :set[M]{code=m21} :foo[q]{id=${B}} ::video{x=1}`,
	].join('\n');
	assert.deepEqual(extractCitations(md), {
		printIds: [A, B, C, D, E],
		setCodes: ['fdn', 'm21'],
	});
});

test('single batch: 3 directives citing 5 cards and 2 sets -> 1 card read + 1 set read', async () => {
	const md = `::cards{ids="${A},${B},${C}"}\n\n:card[d]{id=${D}} :card[e]{id=${E}} :set[F]{code=fdn} :set[M]{code=m21}`;
	const calls: { cards: string[][]; sets: string[][] } = { cards: [], sets: [] };
	const warnings: string[] = [];
	const originalWarn = console.warn;
	console.warn = (msg: string) => warnings.push(msg);
	const res = await resolveCitationsWith<string>(md, {
		cardsByPrintIds: async (ids) => {
			calls.cards.push(ids);
			return new Map(ids.filter((id) => id !== C).map((id) => [id, `card ${id}`]));
		},
		setsByCodes: async (codes) => {
			calls.sets.push(codes);
			return [{ code: 'FDN', name: 'Foundations', iconSvgUri: null }];
		},
	});
	console.warn = originalWarn;
	assert.deepEqual(calls, { cards: [[A, B, C, D, E]], sets: [['fdn', 'm21']] });
	assert.deepEqual(warnings, [
		`[articles] 1 unresolved print ids: ${C}`,
		'[articles] 1 unresolved set codes: m21',
	]);
	assert.equal(res.cards.size, 4);
	assert.equal(res.cards.has(C), false);
	assert.deepEqual([...res.sets.keys()], ['fdn']);
});

test('no citation -> no read at all', async () => {
	let called = 0;
	const res = await resolveCitationsWith<string>('Plain *text*, 12:30.', {
		cardsByPrintIds: async () => {
			called++;
			return new Map();
		},
		setsByCodes: async () => {
			called++;
			return [];
		},
	});
	assert.equal(called, 0);
	assert.equal(res.cards.size + res.sets.size, 0);
});

test('a failing read degrades to an empty map (never throws)', async () => {
	const original = console.error;
	console.error = () => {};
	try {
		const res = await resolveCitationsWith<string>(`:card[x]{id=${A}} :set[s]{code=fdn}`, {
			cardsByPrintIds: async () => {
				throw new Error('db down');
			},
			setsByCodes: () => Promise.reject(new Error('db down')),
		});
		assert.equal(res.cards.size, 0);
		assert.equal(res.sets.size, 0);
	} finally {
		console.error = original;
	}
});

test('markdownExcerpt keeps inline labels only and drops block directives', () => {
	const md = [
		'## Weekly digest',
		'',
		`::cards{ids="${A},${B}"}`,
		'',
		`New: :card[Lightning Bolt]{id=${A}} in :set[Foundations]{code=fdn}.`,
		'',
		':::note[Heads up]',
		'Ratio 2:1 at 12:30, :foo{x=1}gone.',
		':::',
	].join('\n');
	const out = markdownExcerpt(md);
	assert.equal(out, 'Weekly digest New: Lightning Bolt in Foundations. Ratio 2:1 at 12:30, gone.');
	assert.doesNotMatch(out, /::|:[\w-]+\[|\{|\}/);
});

test('markdownExcerpt keeps `::` mid-line and directives inside inline code', () => {
	assert.equal(
		markdownExcerpt('Use std::vector or Foo::Bar, and `:card[Bolt]{id=x}` or `::cards{ids="a"}`.'),
		'Use std::vector or Foo::Bar, and :card[Bolt]{id=x} or ::cards{ids="a"}.'
	);
	assert.equal(markdownExcerpt('  ::cards{ids="a"}\n  :::note\nbody\n   :::'), 'body');
});
