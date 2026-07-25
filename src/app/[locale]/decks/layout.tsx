import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { titleTemplateWithDefault } from '@/lib/seo/site';

// NOTE: this layout is intentionally NOT auth-gated. `/decks/[id]` is publicly
// viewable (read-only) by non-owners, so the redirect lives on the owner-only
// decks-list page (`/decks`) instead — see decks/page.tsx.
//
// `/decks` (the list) is owner-only and redirects anonymous visitors, so it's
// effectively non-indexable — the shareable public list is /users/<nickname>/
// decks. We still give it a localized title (browser-tab UX) but no hreflang
// alternates. `/decks/[id]` overrides this metadata with its own (indexable).
export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.decks' });
	// `title.template` ne s'applique qu'au segment enfant immédiat : un `title`
	// chaîne nue ici effacerait le template racine pour `/decks/[id]`, qui
	// perdrait son préfixe « Wizcard - ». On redéclare donc le template.
	return {
		title: titleTemplateWithDefault(t('title')),
		robots: { index: false, follow: false },
	};
}

export default function DecksLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
