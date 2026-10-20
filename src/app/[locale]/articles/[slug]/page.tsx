import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { localized, markdownExcerpt } from '@/lib/articles/article';
import { getPublishedArticle, resolveCitations } from '@/lib/articles/articles.server';
import { ArticleBody } from '@/lib/articles/ArticleBody/ArticleBody';
import { formatArticleDate } from '../format-date';
import styles from '../articles.module.css';

// ISR: an article is public, cookieless data. Pages are generated on first visit
// and refreshed hourly; an unknown or not-yet-published slug 404s (and that 404
// is revalidated too, so a scheduled article appears within the hour).
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
	return []; // generated on demand
}

/** Decodes the slug segment; null on malformed encoding (e.g. `%E0%A4%A`). */
function decodeSlug(raw: string): string | null {
	try {
		return decodeURIComponent(raw);
	} catch {
		return null;
	}
}

interface ArticlePageProps {
	params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
	const { locale, slug: rawSlug } = await params;
	const slug = decodeSlug(rawSlug);
	const t = await getTranslations({ locale, namespace: 'seo.article' });
	const article = slug === null ? null : await getPublishedArticle(slug);
	if (!article) return { title: t('notFoundTitle'), robots: { index: false, follow: false } };
	const title = localized(article.title, locale);
	const description = markdownExcerpt(localized(article.body, locale));
	return {
		title: t('title', { title }),
		description,
		alternates: buildAlternates(locale, `articles/${encodeURIComponent(article.slug)}`),
		robots: { index: true, follow: true },
		openGraph: {
			type: 'article',
			title,
			description,
			publishedTime: article.publishedAt,
		},
		twitter: { card: 'summary', title, description },
	};
}

export default async function ArticlePage({ params }: ArticlePageProps) {
	const { locale, slug: rawSlug } = await params;
	setRequestLocale(locale);
	const slug = decodeSlug(rawSlug);
	if (slug === null) notFound();
	const article = await getPublishedArticle(slug);
	if (!article) notFound();

	const body = localized(article.body, locale);
	const [t, citations] = await Promise.all([getTranslations('articles'), resolveCitations(body)]);
	const date = formatArticleDate(article.publishedAt, locale);

	return (
		<article lang={locale} className={styles.container}>
			<Link href="/articles" className={styles.back}>
				{t('backToList')}
			</Link>
			<header className={styles.articleHeader}>
				<p className={styles.meta}>
					<Link
						href={{ pathname: '/articles', query: { category: article.category } }}
						className={styles.category}
					>
						{t(`categories.${article.category}`)}
					</Link>
					<time dateTime={article.publishedAt}>{t('publishedOn', { date })}</time>
				</p>
				<h1 className={styles.title}>{localized(article.title, locale)}</h1>
			</header>
			<ArticleBody markdown={body} citations={citations} />
		</article>
	);
}
