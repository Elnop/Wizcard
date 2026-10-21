import type { Card } from '@/types/cards';
import type { ArticleRow, ArticleSummaryRow } from './rows';

/**
 * Article domain: categories, row -> domain mapping and language choice. Pure (no
 * I/O), so it is unit-tested with node:test.
 */

export const ARTICLE_CATEGORIES = ['catalogue', 'magic', 'site'] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export function isArticleCategory(value: unknown): value is ArticleCategory {
	return typeof value === 'string' && (ARTICLE_CATEGORIES as readonly string[]).includes(value);
}

/** The languages an article is written in. Any other locale falls back to English. */
export type ArticleLanguage = 'fr' | 'en';

export function articleLanguageFor(locale: string): ArticleLanguage {
	return locale === 'fr' ? 'fr' : 'en';
}

export interface ArticleSummary {
	slug: string;
	category: ArticleCategory;
	title: { fr: string; en: string };
	publishedAt: string;
}

export interface Article extends ArticleSummary {
	body: { fr: string; en: string };
}

/** Maps a row; returns null for a category this code does not know (DB CHECK drift). */
export function rowToArticleSummary(row: ArticleSummaryRow): ArticleSummary | null {
	if (!isArticleCategory(row.category)) return null;
	return {
		slug: row.slug,
		category: row.category,
		title: { fr: row.title_fr, en: row.title_en },
		publishedAt: row.published_at,
	};
}

export function rowToArticle(row: ArticleRow): Article | null {
	const summary = rowToArticleSummary(row);
	if (!summary) return null;
	return { ...summary, body: { fr: row.body_fr, en: row.body_en } };
}

/**
 * Applies the category filter. `emptyKey` names the `articles.*` message to show
 * when nothing is left: `empty` (no article published at all, whatever the
 * filter) or `emptyCategory` (articles exist, none in the selected category);
 * null when there is something to show.
 */
export function filterArticles<T extends { category: ArticleCategory }>(
	items: T[],
	active: ArticleCategory | null
): { shown: T[]; emptyKey: 'empty' | 'emptyCategory' | null } {
	if (items.length === 0) return { shown: items, emptyKey: 'empty' };
	const shown = active ? items.filter((a) => a.category === active) : items;
	return { shown, emptyKey: shown.length === 0 ? 'emptyCategory' : null };
}

/** Picks the text in the visitor's language (fr -> fr, anything else -> en). */
export function localized(text: { fr: string; en: string }, locale: string): string {
	return text[articleLanguageFor(locale)];
}

/** A `:` right after another `:` or a backslash does not open a text directive. */
function isEscapedColon(text: string, at: number): boolean {
	return at > 0 && (text[at - 1] === ':' || text[at - 1] === '\\');
}

/**
 * Plain-text excerpt of a Markdown body, for the meta description. Strips the
 * common Markdown syntax (headings, emphasis, links, list markers, code fences,
 * HTML tags) and cuts on a word boundary.
 *
 * Directives (see `directives.ts`): block ones (`::cards{…}` lines, `:::x` fences)
 * are dropped, inline ones keep only their label (`:card[Bolt]{id=…}` -> `Bolt`),
 * label-less inline ones with attributes are dropped. Inline code spans are left
 * as written (the page shows them literally). Regex-based on purpose: this module
 * is client-reachable and must not pull the Markdown parser.
 */
export function markdownExcerpt(markdown: string, maxLength = 160): string {
	// Inline code is set aside (private-use placeholder) while the Markdown and
	// directive syntax is stripped, then put back as written.
	const codeSpans: string[] = [];
	const text = markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`\n]*)`/g, (_m, code: string) => `\uE000${codeSpans.push(code) - 1}\uE000`)
		.replace(/^( {0,3}):::+/gm, '$1::') // container fences -> same shape as leaf directives
		.replace(/^ {0,3}::[A-Za-z0-9][\w-]*(?:\[[^\]\n]*\])?(?:\{[^}\n]*\})?/gm, ' ')
		.replace(/^ {0,3}::(?= *$)/gm, ' ')
		.replace(
			/:[A-Za-z0-9][\w-]*\[([^\]\n]*)\](?:\{[^}\n]*\})?/g,
			(m, label: string, at: number, s: string) => (isEscapedColon(s, at) ? m : label)
		)
		.replace(/:[A-Za-z0-9][\w-]*\{[^}\n]*\}/g, (m, at: number, s: string) =>
			isEscapedColon(s, at) ? m : ''
		)
		.replace(/<\/?[a-z][\w-]*(?:\s[^<>]*)?>/gi, ' ')
		.replace(/\]\([^()\s]*\)/g, '')
		.replace(/!?\[/g, '')
		.replace(/\]/g, '')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
		.replace(/[*_`~]+/g, '')
		.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => codeSpans[Number(i)])
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) return text;
	const cut = text.slice(0, maxLength - 1);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The slice of a `Card` a `::cards` grid needs: the link id plus exactly the fields
 * the client `CardImage` reads. Keeps the RSC payload small (a digest cites dozens
 * of cards) instead of shipping whole cards to the client.
 */
export interface ArticleCard {
	id: string;
	name: string;
	set: string;
	collector_number: string;
	oracle_id: string;
	image_status?: Card['image_status'];
	image_uris?: Card['image_uris'];
	card_faces?: Array<{ name?: string; image_uris?: Card['image_uris'] }>;
}

export function toArticleCard(card: Card): ArticleCard {
	return {
		id: card.id,
		name: card.name,
		set: card.set,
		collector_number: card.collector_number,
		oracle_id: card.oracle_id,
		image_status: card.image_status,
		image_uris: card.image_uris,
		card_faces: card.card_faces?.map((f) => ({ name: f.name, image_uris: f.image_uris })),
	};
}
