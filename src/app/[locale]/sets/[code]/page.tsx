import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { SetDetailClient } from './SetDetailClient';

interface SetPageProps {
	params: Promise<{
		locale: Locale;
		code: string;
	}>;
}

export async function generateMetadata({ params }: SetPageProps): Promise<Metadata> {
	const { locale, code } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.setDetail' });
	return {
		title: t('title', { code: decodeURIComponent(code).toUpperCase() }),
		alternates: buildAlternates(locale, `sets/${encodeURIComponent(decodeURIComponent(code))}`),
	};
}

export default async function SetPage({ params }: SetPageProps) {
	const { code } = await params;
	return <SetDetailClient code={decodeURIComponent(code)} />;
}
