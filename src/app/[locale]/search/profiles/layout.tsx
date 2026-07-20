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
	const t = await getTranslations({ locale, namespace: 'seo.searchProfiles' });
	return {
		title: t('title'),
		description: t('description'),
		alternates: buildAlternates(locale, 'search/profiles'),
		robots: { index: true, follow: true },
	};
}

export default function SearchProfilesLayout({ children }: { children: React.ReactNode }) {
	return children;
}
