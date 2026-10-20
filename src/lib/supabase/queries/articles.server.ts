import { createCatalogClient } from '@/lib/supabase/catalog';
import type { ArticleRow, ArticleSlugRow, ArticleSummaryRow } from '@/lib/articles/rows';

/**
 * Raw Supabase access for `articles`. ONLY place that issues these
 * client.from('articles') calls. Returns DB rows; domain mapping (row -> Article)
 * and language choice live in `src/lib/articles/`.
 *
 * Reads go through the cookieless catalog client so the article pages can be
 * statically generated (ISR). RLS already hides unpublished articles from anon;
 * every query ALSO filters `published_at <= now()` explicitly, so a policy drift
 * can never leak a scheduled article.
 */

const SUMMARY_SELECT = 'slug, category, title_fr, title_en, published_at';
const ARTICLE_SELECT = `${SUMMARY_SELECT}, body_fr, body_en`;

/** Bound on list reads (PostgREST caps at max_rows anyway); one digest a week. */
const LIST_LIMIT = 500;

/** Published articles, newest first. */
export async function fetchPublishedArticles(): Promise<ArticleSummaryRow[]> {
	const client = createCatalogClient();
	const { data, error } = await client
		.from('articles')
		.select(SUMMARY_SELECT)
		.lte('published_at', new Date().toISOString())
		.order('published_at', { ascending: false })
		.limit(LIST_LIMIT);
	if (error) throw new Error(`fetchPublishedArticles: ${error.message}`);
	return (data ?? []) as ArticleSummaryRow[];
}

/** One published article by slug, or null (unknown slug or not yet published). */
export async function fetchPublishedArticleBySlug(slug: string): Promise<ArticleRow | null> {
	const client = createCatalogClient();
	const { data, error } = await client
		.from('articles')
		.select(ARTICLE_SELECT)
		.eq('slug', slug)
		.lte('published_at', new Date().toISOString())
		.maybeSingle();
	if (error) throw new Error(`fetchPublishedArticleBySlug: ${error.message}`);
	return (data as ArticleRow | null) ?? null;
}

/** Slugs of every published article, for the sitemap. */
export async function fetchPublishedArticleSlugs(): Promise<ArticleSlugRow[]> {
	const client = createCatalogClient();
	const { data, error } = await client
		.from('articles')
		.select('slug, published_at')
		.lte('published_at', new Date().toISOString())
		.order('published_at', { ascending: false })
		.limit(LIST_LIMIT);
	if (error) throw new Error(`fetchPublishedArticleSlugs: ${error.message}`);
	return (data ?? []) as ArticleSlugRow[];
}
