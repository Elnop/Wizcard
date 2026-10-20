import { cache } from 'react';
import {
	fetchPublishedArticleBySlug,
	fetchPublishedArticles,
} from '@/lib/supabase/queries/articles.server';
import { fetchSetsByCodes } from '@/lib/supabase/queries/card-sets.server';
import { byPrintIds } from '@/lib/card/catalog-db';
import {
	type Article,
	type ArticleCard,
	type ArticleSummary,
	rowToArticle,
	rowToArticleSummary,
	toArticleCard,
} from './article';
import { type ResolvedCitations, resolveCitationsWith } from './directives';

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

/**
 * Cards and sets cited by the directives of a body, read in one batch each
 * (`byPrintIds`, one `card_sets` request). Never throws: a failed read leaves its
 * map empty and the matching directives render as plain text; ids/codes that came
 * back unresolved are logged (`console.warn`). Cards are projected to `ArticleCard`.
 */
export function resolveCitations(bodyMarkdown: string): Promise<ResolvedCitations<ArticleCard>> {
	return resolveCitationsWith<ArticleCard>(bodyMarkdown, {
		cardsByPrintIds: async (ids) =>
			new Map([...(await byPrintIds(ids))].map(([id, card]) => [id, toArticleCard(card)])),
		setsByCodes: async (codes) =>
			(await fetchSetsByCodes(codes)).map((row) => ({
				code: row.code,
				name: row.name,
				iconSvgUri: row.icon_svg_uri,
			})),
	});
}
