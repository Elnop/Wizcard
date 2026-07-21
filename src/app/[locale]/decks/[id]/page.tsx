import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { fetchDeckMetaServer } from '@/lib/deck/db/deck.server';
import DeckDetailClient from './DeckDetailClient';

interface DeckPageProps {
	params: Promise<{ locale: Locale; id: string }>;
}

export async function generateMetadata({ params }: DeckPageProps): Promise<Metadata> {
	const { locale, id } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.deck' });
	const deck = await fetchDeckMetaServer(id);
	if (!deck) return { title: t('notFoundTitle'), robots: { index: false, follow: false } };
	const desc =
		deck.description?.slice(0, 160) ?? t('defaultDescription', { format: deck.format ?? 'MTG' });
	// Next.js auto-detects opengraph-image.tsx and injects the og:image/twitter
	// image tags for both openGraph and twitter, so we only set the text fields
	// here and let the generated card supply the image.
	return {
		title: deck.name,
		description: desc,
		// `/decks/[id]` is publicly shareable, so re-enable indexing (the parent
		// decks/layout.tsx sets noindex for the owner-only /decks list).
		robots: { index: true, follow: true },
		alternates: buildAlternates(locale, `decks/${deck.id}`),
		openGraph: {
			type: 'website',
			title: deck.name,
			description: desc,
			url: `/${locale}/decks/${deck.id}`,
			siteName: 'Wizcard',
		},
		twitter: {
			card: 'summary_large_image',
			title: deck.name,
			description: desc,
		},
	};
}

export default async function DeckPage({ params }: DeckPageProps) {
	const { id } = await params;
	const deck = await fetchDeckMetaServer(id);
	return (
		<>
			{/* Server-rendered heading for crawlers; visual heading comes from the
			    client view. Off-screen so it doesn't duplicate on screen. */}
			<h1
				style={{
					position: 'absolute',
					width: 1,
					height: 1,
					overflow: 'hidden',
					clip: 'rect(0 0 0 0)',
				}}
			>
				{deck?.name ?? 'Deck'}
			</h1>
			<DeckDetailClient />
		</>
	);
}
