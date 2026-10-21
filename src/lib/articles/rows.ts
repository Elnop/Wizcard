/**
 * DB row shapes of `public.articles`, written by hand (no generated types). Kept in
 * a neutral module so client code that imports the article domain never reaches
 * the server-only query module.
 */

export interface ArticleSummaryRow {
	slug: string;
	category: string;
	title_fr: string;
	title_en: string;
	published_at: string;
}

export interface ArticleRow extends ArticleSummaryRow {
	body_fr: string;
	body_en: string;
}

export interface ArticleSlugRow {
	slug: string;
	published_at: string;
}
