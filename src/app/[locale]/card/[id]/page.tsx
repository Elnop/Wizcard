import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { getCardById } from '@/lib/card/source';
import { getCustomCardWithSource } from '@/lib/mpc/db/custom-cards.server';
import { CardPageHeader } from './components/CardPageHeader/CardPageHeader';
import { CardTabs } from './components/CardTabs/CardTabs';
import styles from './page.module.css';

// ISR: the public card page is static catalog data. Generate each card on first
// access and cache it (revalidate 7 days). The mpc: branch reads cookies (owner-gated
// custom cards), which keeps those specific renders dynamic — official cards cache.
export const revalidate = 604800; // 7 days
export const dynamicParams = true;

export async function generateStaticParams() {
	return []; // 159k prints × 2 locales is too many to build; everything is on-demand ISR
}

interface CardPageProps {
	params: Promise<{
		locale: Locale;
		id: string;
	}>;
}

export async function generateMetadata({ params }: CardPageProps) {
	const { locale, id: rawId } = await params;
	const id = decodeURIComponent(rawId);
	const t = await getTranslations({ locale, namespace: 'seo.cardNotFound' });

	if (id.startsWith('mpc:')) {
		const card = await getCustomCardWithSource(id);
		if (!card) return { title: t('title') };
		return {
			title: card.name,
			description: card.type_line ?? card.name,
			alternates: buildAlternates(locale, `card/${encodeURIComponent(id)}`),
		};
	}

	try {
		const card = await getCardById(id);
		return {
			title: card.name,
			description: `${card.type_line} - ${card.oracle_text?.slice(0, 150) ?? card.name}`,
			alternates: buildAlternates(locale, `card/${encodeURIComponent(id)}`),
		};
	} catch {
		return {
			title: t('title'),
		};
	}
}

export default async function CardPage({ params }: CardPageProps) {
	const { id: rawId } = await params;
	const id = decodeURIComponent(rawId);

	if (id.startsWith('mpc:')) {
		const card = await getCustomCardWithSource(id);
		if (!card) notFound();
		return (
			<div className={styles.page}>
				<CardPageHeader card={card} />
				<Suspense>
					<CardTabs card={card} />
				</Suspense>
			</div>
		);
	}

	let card;
	try {
		card = await getCardById(id);
	} catch {
		notFound();
	}

	if (!card) notFound();

	return (
		<div className={styles.page}>
			<CardPageHeader card={card} />
			<Suspense>
				<CardTabs card={card} />
			</Suspense>
		</div>
	);
}
