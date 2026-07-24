import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { CardEditorStudio } from './components/CardEditorStudio/CardEditorStudio';

interface StudioPageProps {
	params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: StudioPageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'cardEditor.seo' });
	return {
		title: t('title'),
		description: t('description'),
		alternates: buildAlternates(locale, 'studio'),
	};
}

export default async function StudioPage({ params }: StudioPageProps) {
	const { locale } = await params;
	setRequestLocale(locale);
	return <CardEditorStudio />;
}
