import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchDeckMetaServer, fetchPublicDeckDataServer } from '@/lib/deck/db/deck.server';
import type { DeckMeta } from '@/types/decks';
import { SITE_URL } from '@/lib/seo/site';
import DeckDetailOwnerView from './DeckDetailOwnerView';
import { DeckDetailReadOnlyView } from './DeckDetailReadOnlyView';

interface DeckPageProps {
	params: Promise<{ locale: Locale; id: string }>;
}

/**
 * Description composée depuis les données réelles du deck plutôt que le libellé
 * générique `defaultDescription` : celui-ci ne dépend que du format, donc tous
 * les decks d'un même format partageaient la même meta description (~50 URLs en
 * quasi-duplicate, signal de thin content).
 *
 * L'ordre de préférence est : description saisie par l'auteur > commandant +
 * format + nombre de cartes > format + nombre de cartes > libellé générique.
 *
 * Best-effort : un échec de lecture des cartes retombe sur `defaultDescription`.
 * `generateMetadata` ne doit jamais faire échouer le rendu de la page.
 */
async function buildDeckDescription(
	deck: DeckMeta,
	t: Awaited<ReturnType<typeof getTranslations<'seo.deck'>>>
): Promise<string> {
	const authored = deck.description?.trim();
	if (authored) return authored.slice(0, 160);

	const format = deck.format ?? 'MTG';
	try {
		const { deckCards, cards } = await fetchPublicDeckDataServer(deck.id, deck.ownerId);
		// Une ligne `card_entries` = un exemplaire physique (pas de colonne
		// quantity), donc le total des cartes est le nombre de lignes.
		const cardCount = deckCards.length;
		if (cardCount === 0) return t('defaultDescription', { format });

		// Le commandant n'est pas marqué en base : pour un deck Commander on retient
		// la première créature légendaire, ce qui correspond à l'ordre `date_added`
		// dans lequel l'import place le commandant.
		const commander =
			deck.format === 'commander'
				? cards.find((c) => c.type_line?.includes('Legendary') && c.type_line?.includes('Creature'))
						?.name
				: undefined;

		return commander
			? t('descriptionWithCommander', { commander, format, cards: cardCount })
			: t('descriptionWithFormat', { format, cards: cardCount });
	} catch {
		return t('defaultDescription', { format });
	}
}

export async function generateMetadata({ params }: DeckPageProps): Promise<Metadata> {
	const { locale, id } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.deck' });
	const deck = await fetchDeckMetaServer(id);
	if (!deck) return { title: t('notFoundTitle'), robots: { index: false, follow: false } };
	const desc = await buildDeckDescription(deck, t);
	// Next.js auto-detects opengraph-image.tsx and injects the og:image/twitter
	// image tags for both openGraph and twitter, so we only set the text fields
	// here and let the generated card supply the image.
	return {
		// Le template racine prefixe « Wizcard - », d'ou un titre d'onglet
		// « Wizcard - deck Slivoid ». Les titres og:/twitter: ne passent pas par le
		// template, donc ils gardent le nom nu du deck.
		title: t('title', { name: deck.name }),
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
	const { locale, id } = await params;
	const deck = await fetchDeckMetaServer(id);
	// RLS already hid a deck this viewer may not see, so a null deck is a real 404
	// (the route used to answer 200 with a client-rendered "not found" screen).
	if (!deck) notFound();

	// getUser() verifies the token server-side; getSession() would trust an
	// unverified cookie for an ownership decision.
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (user && deck.ownerId === user.id) {
		return <DeckDetailOwnerView deckId={id} />;
	}

	const { deckCards, cards, ownerNickname } = await fetchPublicDeckDataServer(id, deck.ownerId);

	// Données structurées : seulement sur la vue publique (la vue propriétaire
	// n'est pas indexable) et seulement si le deck a du contenu résolu, pour ne
	// pas déclarer un ItemList vide. `name` seul suffit ici — c'est ce que les
	// moteurs consomment ; les URLs de cartes ne sont pas des pages canoniques.
	const jsonLd =
		cards.length > 0
			? {
					'@context': 'https://schema.org',
					'@type': 'ItemList',
					name: deck.name,
					url: `${SITE_URL}/${locale}/decks/${deck.id}`,
					numberOfItems: deckCards.length,
					...(ownerNickname ? { creator: { '@type': 'Person', name: ownerNickname } } : {}),
					itemListElement: cards.map((card, i) => ({
						'@type': 'ListItem',
						position: i + 1,
						name: card.name,
					})),
				}
			: null;

	return (
		<>
			{jsonLd && (
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				/>
			)}
			<DeckDetailReadOnlyView deckId={id} initial={{ deck, ownerNickname, deckCards, cards }} />
		</>
	);
}
