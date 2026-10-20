import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { type ArticleSummary, localized } from '@/lib/articles/article';
import { getPublishedArticles } from '@/lib/articles/articles.server';
import { ArticleList, ArticleListView, type ArticleListItem } from './ArticleList';
import { formatArticleDate } from './format-date';
import styles from './articles.module.css';

// ISR: the article list is the same for every visitor (public, cookieless read),
// so it is statically generated and refreshed hourly. The `?category=` filter is
// applied client-side (ArticleList reads the search params): reading
// `searchParams` here would make the route dynamic. The server HTML is the full
// list, used as the Suspense fallback.
export const revalidate = 3600;

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.articles' });
	return {
		title: t('title'),
		description: t('description'),
		alternates: buildAlternates(locale, 'articles'),
		robots: { index: true, follow: true },
	};
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: Locale }> }) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations('articles');

	// The list is prerendered at build time: an unreachable DB or a not-yet-migrated
	// table (deploy before the migration) must not fail the build. Render the empty
	// list; ISR retries within the hour.
	let articles: ArticleSummary[] = [];
	try {
		articles = await getPublishedArticles();
	} catch (error) {
		console.error('[articles] list read failed, rendering an empty list', error);
	}
	const items: ArticleListItem[] = articles.map((a) => ({
		slug: a.slug,
		category: a.category,
		title: localized(a.title, locale),
		publishedAt: a.publishedAt,
		date: formatArticleDate(a.publishedAt, locale),
	}));

	return (
		<div lang={locale} className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>{t('title')}</h1>
				<p className={styles.intro}>{t('intro')}</p>
			</header>
			<Suspense fallback={<ArticleListView articles={items} active={null} />}>
				<ArticleList articles={items} />
			</Suspense>
		</div>
	);
}
