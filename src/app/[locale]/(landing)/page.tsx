import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
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
	return (
		<div className={styles.page}>
			<Hero />
			<FeatureSections />
			<FinalCTA />
		</div>
	);
}
