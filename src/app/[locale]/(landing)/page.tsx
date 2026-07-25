import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { SITE_URL, SITE_NAME } from '@/lib/seo/site';
import { Hero } from './components/Hero/Hero';
import { FeatureSections } from './components/FeatureSections';
import { FinalCTA } from './components/FinalCTA/FinalCTA';
import styles from './page.module.css';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.home' });
	return {
		title: { absolute: t('title') },
		description: t('description'),
		alternates: buildAlternates(locale),
	};
}

export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
	const { locale } = await params;
	setRequestLocale(locale);

	// `target` doit refléter la vraie route de recherche : /search/cards attend
	// `name=`, pas `q=` (voir search/page.tsx). Un paramètre erroné rendrait la
	// sitelinks searchbox inopérante.
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE_NAME,
		url: `${SITE_URL}/${locale}`,
		potentialAction: {
			'@type': 'SearchAction',
			target: {
				'@type': 'EntryPoint',
				urlTemplate: `${SITE_URL}/${locale}/search/cards?name={search_term_string}`,
			},
			'query-input': 'required name=search_term_string',
		},
	};

	return (
		<div className={styles.page}>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<Hero />
			<FeatureSections />
			<FinalCTA />
		</div>
	);
}
