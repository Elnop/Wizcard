import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { SetsPageClient } from './SetsPageClient';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.sets' });
	return { title: t('title'), alternates: buildAlternates(locale, 'sets') };
}

export default function SetsPage() {
	return <SetsPageClient />;
}
