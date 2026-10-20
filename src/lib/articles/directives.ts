import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';

/**
 * Rich directives in article bodies. Pure (no I/O), unit-tested with node:test.
 *
 * Three directives are known, each in exactly one form:
 *
 * - `::cards{ids="<print id>,<print id>"}` (leaf/block) — a grid of card images.
 * - `:card[label]{id=<print id>}` (text/inline) — a link to the card page.
 * - `:set[label]{code=<set code>}` (text/inline) — a link to the set page, with its icon.
 *
 * The SAME parser (remark-parse + remark-gfm + remark-directive) drives both the
 * citation extraction (to batch-resolve cards and sets before rendering) and the
 * rendering plugin, so they always agree on what is a directive.
 *
 * A labelled `:card`/`:set` whose id or code is malformed (non-UUID id, invalid set
 * code, missing attribute) renders its label alone, like an unknown one. Any other
 * directive — unknown name, wrong form (`::card`, `:::cards`), label-less `:card`/
 * `:set`, `::cards` without a valid id — renders as its SOURCE text. This also
 * covers remark-directive's false positives: `2:1` and `12:30` parse as text
 * directives named `1` / `30` and come back unchanged.
 *
 * Inside a link (or a `:card`/`:set` label), links flatten to their text and
 * `:card`/`:set` to their label, so `<a>` never nests.
 *
 * A known, valid directive is turned into a plain `div`/`span` carrying a
 * `data-wz-*` property; `ArticleBody` maps those to site components and decides,
 * from the resolved catalog data, between the component and the plain-text label
 * (unknown card or set).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Scryfall set codes: short lowercase alphanumerics (`fdn`, `pdom`, `30a`, `plst`). */
const SET_CODE_RE = /^[a-z0-9]{2,8}$/;

/** Lowercased print id, or null when it is not a UUID. */
export function normalizePrintId(raw: string): string | null {
	const id = raw.trim().toLowerCase();
	return UUID_RE.test(id) ? id : null;
}

/** Lowercased set code, or null when it is not a plausible set code. */
export function normalizeSetCode(raw: string): string | null {
	const code = raw.trim().toLowerCase();
	return SET_CODE_RE.test(code) ? code : null;
}

/** hast properties set on known directives; ArticleBody reads them back. */
export const DIRECTIVE_PROPS = {
	cards: 'dataWzCards',
	card: 'dataWzCard',
	set: 'dataWzSet',
} as const;

export type Citation =
	{ kind: 'cards'; ids: string[] } | { kind: 'card'; id: string } | { kind: 'set'; code: string };

/** Minimal mdast shape this module needs (directive nodes included). */
interface MdNode {
	type: string;
	name?: string;
	attributes?: Record<string, string | null | undefined> | null;
	children?: MdNode[];
	value?: string;
	position?: { start: { offset?: number }; end: { offset?: number } };
	data?: Record<string, unknown>;
}

const DIRECTIVE_TYPES = new Set(['textDirective', 'leafDirective', 'containerDirective']);

function attr(node: MdNode, name: string): string {
	const value = node.attributes?.[name];
	return typeof value === 'string' ? value.trim() : '';
}

/** Visible text of a node (a directive label), without any markup. */
function plainText(node: MdNode): string {
	if (typeof node.value === 'string') return node.value;
	return (node.children ?? []).map(plainText).join('');
}

/** A `:card` / `:set` text directive WITH a label (its link text). */
function isLabelledLink(node: MdNode): boolean {
	return (
		node.type === 'textDirective' &&
		(node.name === 'card' || node.name === 'set') &&
		plainText(node).trim() !== ''
	);
}

/**
 * What a directive node cites, or null when it is unknown or malformed. A labelled
 * `:card`/`:set` whose id/code is malformed renders its label alone (like an
 * unknown id/code); every other null renders as source text.
 */
export function classifyDirective(node: MdNode): Citation | null {
	if (node.type === 'leafDirective' && node.name === 'cards') {
		const raw = attr(node, 'ids');
		if (!raw) return null;
		const ids = [
			...new Set(
				raw
					.split(',')
					.map(normalizePrintId)
					.filter((id): id is string => id !== null)
			),
		];
		return ids.length > 0 ? { kind: 'cards', ids } : null;
	}
	if (node.type === 'textDirective' && (node.name === 'card' || node.name === 'set')) {
		if (!isLabelledLink(node)) return null; // the label is the link text: required
		if (node.name === 'card') {
			const id = normalizePrintId(attr(node, 'id'));
			return id ? { kind: 'card', id } : null;
		}
		const code = normalizeSetCode(attr(node, 'code'));
		return code ? { kind: 'set', code } : null;
	}
	return null;
}

/**
 * Syntax extensions of the article Markdown, shared by the renderer (`ArticleBody`)
 * and the extraction below so both parse a body the same way.
 */
export const ARTICLE_SYNTAX_PLUGINS = [remarkGfm, remarkDirective];

/** Parses Markdown exactly like the article renderer does (minus the rewrite). */
function parse(markdown: string): MdNode {
	return unified()
		.use(remarkParse)
		.use(ARTICLE_SYNTAX_PLUGINS)
		.parse(markdown) as unknown as MdNode;
}

function walk(node: MdNode, visit: (n: MdNode) => void): void {
	visit(node);
	for (const child of node.children ?? []) walk(child, visit);
}

/**
 * Every print id and set code cited by known, valid directives, deduplicated, in
 * first-seen order. One batch read each is enough to render the whole article.
 */
export function extractCitations(markdown: string): { printIds: string[]; setCodes: string[] } {
	const printIds = new Set<string>();
	const setCodes = new Set<string>();
	walk(parse(markdown), (node) => {
		if (!DIRECTIVE_TYPES.has(node.type)) return;
		const c = classifyDirective(node);
		if (c?.kind === 'cards') c.ids.forEach((id) => printIds.add(id));
		else if (c?.kind === 'card') printIds.add(c.id);
		else if (c?.kind === 'set') setCodes.add(c.code);
	});
	return { printIds: [...printIds], setCodes: [...setCodes] };
}

// --- Batch resolution ------------------------------------------------------------

/** What a `:set` link needs from `card_sets`. */
export interface ArticleSetRef {
	code: string;
	name: string;
	iconSvgUri: string | null;
}

export interface ResolvedCitations<C> {
	/** Print id (lowercase) -> card. */
	cards: Map<string, C>;
	/** Set code (lowercase) -> set. */
	sets: Map<string, ArticleSetRef>;
}

/**
 * Extracts the citations of a body and resolves them with ONE call to each reader
 * (none when nothing is cited), in parallel. A failing reader degrades to an empty
 * map: the directives it should have resolved then render as plain text.
 */
export async function resolveCitationsWith<C>(
	markdown: string,
	readers: {
		cardsByPrintIds: (ids: string[]) => Promise<Map<string, C>>;
		setsByCodes: (codes: string[]) => Promise<ArticleSetRef[]>;
	}
): Promise<ResolvedCitations<C>> {
	const { printIds, setCodes } = extractCitations(markdown);
	const [cards, sets] = await Promise.all([
		printIds.length === 0
			? new Map<string, C>()
			: readers.cardsByPrintIds(printIds).catch((err: unknown) => {
					console.error('[articles] card citations failed:', err);
					return new Map<string, C>();
				}),
		setCodes.length === 0
			? []
			: readers.setsByCodes(setCodes).catch((err: unknown) => {
					console.error('[articles] set citations failed:', err);
					return [];
				}),
	]);
	const setMap = new Map(sets.map((s) => [s.code.toLowerCase(), s]));
	warnUnresolved('print ids', printIds, cards);
	warnUnresolved('set codes', setCodes, setMap);
	return { cards, sets: setMap };
}

function warnUnresolved(what: string, requested: string[], found: Map<string, unknown>): void {
	const missing = requested.filter((key) => !found.has(key));
	if (missing.length > 0) {
		console.warn(`[articles] ${missing.length} unresolved ${what}: ${missing.join(', ')}`);
	}
}

// --- Rendering plugin -------------------------------------------------------------

function sourceOf(node: MdNode, source: string): string {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (typeof start === 'number' && typeof end === 'number' && end >= start) {
		return source.slice(start, end);
	}
	// No position (never the case with remark-parse): keep at least the label.
	return plainText(node);
}

const text = (value: string): MdNode => ({ type: 'text', value });
const paragraph = (value: string): MdNode => ({ type: 'paragraph', children: [text(value)] });

/** Replacement nodes that show an unknown or malformed directive as written. */
function sourceFallback(node: MdNode, source: string): MdNode[] {
	const src = sourceOf(node, source);
	if (node.type === 'textDirective') return [text(src)];
	if (node.type === 'leafDirective') return [paragraph(src)];
	// Container: keep its (already rewritten) Markdown content, show the fences as text.
	const lines = src.split('\n');
	const opening = lines[0];
	const closing = lines.length > 1 && /^\s*:{3,}\s*$/.test(lines[lines.length - 1]);
	const body = (node.children ?? []).filter((c) => c.data?.directiveLabel !== true);
	return [
		paragraph(opening),
		...body,
		...(closing ? [paragraph(lines[lines.length - 1].trim())] : []),
	];
}

function citationValue(c: Citation): string {
	if (c.kind === 'cards') return c.ids.join(',');
	return c.kind === 'card' ? c.id : c.code;
}

/** Joins adjacent text nodes (a fallback splits `2:1` into `2` + `:1`). */
function mergeTexts(nodes: MdNode[]): MdNode[] {
	const out: MdNode[] = [];
	for (const node of nodes) {
		const last = out[out.length - 1];
		if (node.type === 'text' && last?.type === 'text') {
			out[out.length - 1] = { ...last, value: `${last.value ?? ''}${node.value ?? ''}` };
		} else {
			out.push(node);
		}
	}
	return out;
}

const LINK_TYPES = new Set(['link', 'linkReference']);

/**
 * `inLink`: the node sits inside something rendered as `<a>` (a Markdown link, or
 * the label of a `:card`/`:set`). An `<a>` there would nest (invalid HTML,
 * hydration error), so links are flattened to their text and `:card`/`:set` to
 * their label.
 */
function rewrite(node: MdNode, source: string, inLink: boolean): MdNode[] {
	if (node.children) {
		const childInLink = inLink || LINK_TYPES.has(node.type) || isLabelledLink(node);
		node.children = mergeTexts(node.children.flatMap((c) => rewrite(c, source, childInLink)));
	}
	if (LINK_TYPES.has(node.type)) return inLink ? (node.children ?? []) : [node];
	if (!DIRECTIVE_TYPES.has(node.type)) return [node];
	const c = classifyDirective(node);
	if (isLabelledLink(node) && (!c || inLink)) return node.children ?? [];
	if (!c) return sourceFallback(node, source);
	node.data = {
		...node.data,
		hName: c.kind === 'cards' ? 'div' : 'span',
		hProperties: { [DIRECTIVE_PROPS[c.kind]]: citationValue(c) },
	};
	if (c.kind === 'cards') node.children = []; // a grid has no label
	return [node];
}

/**
 * Rewrites the directives parsed by `ARTICLE_SYNTAX_PLUGINS`: known and valid ones
 * into `div`/`span` nodes tagged with a `data-wz-*` property, every other one into
 * its source text. Use after the syntax plugins.
 */
export function remarkArticleDirectives() {
	// `object`, not mdast's `Root`: this module types nodes structurally (MdNode).
	return (tree: object, file: { value: unknown }) => {
		rewrite(tree as MdNode, String(file.value ?? ''), false);
	};
}

/** Parses a body and applies the directive rewrite: the mdast the renderer gets. */
export function parseArticleBody(markdown: string): MdNode {
	const tree = parse(markdown);
	rewrite(tree, markdown, false);
	return tree;
}
