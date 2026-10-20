import { cache } from 'react';
import {
	fetchPublishedArticleBySlug,
	fetchPublishedArticles,
} from '@/lib/supabase/queries/articles.server';
import { type Article, type ArticleSummary, rowToArticle, rowToArticleSummary } from './article';

/** Published articles, newest first. */
export async function getPublishedArticles(): Promise<ArticleSummary[]> {
	const rows = await fetchPublishedArticles();
	return rows.map(rowToArticleSummary).filter((a): a is ArticleSummary => a !== null);
}

/**
 * One published article, or null when the slug is unknown or not yet published.
 * Memoized per request: generateMetadata and the page both read it.
 */
export const getPublishedArticle = cache(async (slug: string): Promise<Article | null> => {
	const row = await fetchPublishedArticleBySlug(slug);
	return row ? rowToArticle(row) : null;
});
