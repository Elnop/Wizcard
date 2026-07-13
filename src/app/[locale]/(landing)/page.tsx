import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { Hero } from './components/Hero/Hero';
import { Features } from './components/Features/Features';
import { CallToAction } from './components/CallToAction/CallToAction';
import styles from './page.module.css';

// Below-the-fold and pulls in the shared CardList component tree; deferring
// its chunk keeps it off the critical path for the Navbar-logo LCP without
// affecting search/deck, which import CardList directly.
const CardShowcase = dynamic(() =>
	import('./components/CardShowcase/CardShowcase').then((m) => m.CardShowcase)
);

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
			<CardShowcase />
			<Features />
			<CallToAction />
		</div>
	);
}
