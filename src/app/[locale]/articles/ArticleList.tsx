'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
	ARTICLE_CATEGORIES,
	type ArticleCategory,
	filterArticles,
	isArticleCategory,
} from '@/lib/articles/article';
import styles from './articles.module.css';

export interface ArticleListItem {
	slug: string;
	category: ArticleCategory;
	/** Already in the visitor's language. */
	title: string;
	publishedAt: string;
	/** Already formatted for the visitor's locale. */
	date: string;
}

/** Reads `?category=`; an unknown category is ignored (full list). */
export function ArticleList({ articles }: { articles: ArticleListItem[] }) {
	const raw = useSearchParams().get('category');
	return <ArticleListView articles={articles} active={isArticleCategory(raw) ? raw : null} />;
}

export function ArticleListView({
	articles,
	active,
}: {
	articles: ArticleListItem[];
	active: ArticleCategory | null;
}) {
	const t = useTranslations('articles');
	const { shown, emptyKey } = filterArticles(articles, active);
	const emptyMessage = emptyKey ? t(emptyKey) : null;

	return (
		<>
			<nav className={styles.filters} aria-label={t('filterLabel')}>
				<Link
					href="/articles"
					className={`${styles.filter} ${active === null ? styles.filterActive : ''}`}
					aria-current={active === null ? 'page' : undefined}
				>
					{t('all')}
				</Link>
				{ARTICLE_CATEGORIES.map((c) => (
					<Link
						key={c}
						href={{ pathname: '/articles', query: { category: c } }}
						className={`${styles.filter} ${active === c ? styles.filterActive : ''}`}
						aria-current={active === c ? 'page' : undefined}
					>
						{t(`categories.${c}`)}
					</Link>
				))}
			</nav>

			{emptyMessage ? (
				<p className={styles.empty}>{emptyMessage}</p>
			) : (
				<ul className={styles.list}>
					{shown.map((a) => (
						<li key={a.slug} className={styles.item}>
							<Link href={`/articles/${encodeURIComponent(a.slug)}`} className={styles.itemLink}>
								<span className={styles.meta}>
									<span className={styles.category}>{t(`categories.${a.category}`)}</span>
									<time dateTime={a.publishedAt}>{a.date}</time>
								</span>
								<span className={styles.itemTitle}>{a.title}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
