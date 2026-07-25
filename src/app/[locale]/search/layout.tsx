import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { titleTemplateWithDefault } from '@/lib/seo/site';

/**
 * Metadata de la landing `/search` uniquement. Chaque sous-route
 * (`cards`, `decks`, `profiles`) définit son propre `generateMetadata` avec son
 * canonical : sans ça toutes hériteraient de `/search` et se déclareraient comme
 * une seule et même page.
 */
export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.search' });
	return {
		// Voir decks/layout.tsx : le template racine doit être redéclaré, sinon les
		// sous-routes (`cards`, `decks`, `profiles`) perdent le préfixe « Wizcard - ».
		title: titleTemplateWithDefault(t('title')),
		description: t('description'),
		alternates: buildAlternates(locale, 'search'),
		robots: { index: true, follow: true },
	};
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
	return children;
}
