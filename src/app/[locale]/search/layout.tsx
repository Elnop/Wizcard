import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.search' });
	return {
		title: t('title'),
		description: t('description'),
		alternates: buildAlternates(locale, 'search'),
		robots: { index: true, follow: true },
	};
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
	return children;
}
