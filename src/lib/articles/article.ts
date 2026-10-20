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

/**
 * Plain-text excerpt of a Markdown body, for the meta description. Strips the
 * common Markdown syntax (headings, emphasis, links, list markers, code fences,
 * HTML tags) and cuts on a word boundary.
 */
export function markdownExcerpt(markdown: string, maxLength = 160): string {
	const text = markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/<\/?[a-z][\w-]*(?:\s[^<>]*)?>/gi, ' ')
		.replace(/\]\([^()\s]*\)/g, '')
		.replace(/!?\[/g, '')
		.replace(/\]/g, '')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
		.replace(/[*_`~]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) return text;
	const cut = text.slice(0, maxLength - 1);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
