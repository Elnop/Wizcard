'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { DeckCard } from '@/app/[locale]/decks/components/DeckCard/DeckCard';
import { ProfileCard } from '@/lib/search/components/ProfileCard/ProfileCard';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useDeckSearch } from '@/lib/search/hooks/useDeckSearch';
import { useProfileSearch } from '@/lib/search/hooks/useProfileSearch';
import { useProfileStats } from '@/lib/search/hooks/useProfileStats';
import { useDeckSummaries } from '@/app/[locale]/decks/useDeckSummaries';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { useDebounce } from '@/lib/search/hooks/useDebounce';
import { DEFAULT_DECK_FILTERS } from '@/lib/search/types';
import { useLandingSearchUrlState } from './useLandingSearchUrlState';
import styles from './page.module.css';
import landing from './landing.module.css';

/** Nombre d'éléments par section. Les cartes sont larges et les profils
 * compacts : ces limites donnent des rangées de hauteur comparable. */
const CARD_LIMIT = 6;
const DECK_LIMIT = 3;
const PROFILE_LIMIT = 4;

export default function SearchLandingPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchLandingContent />
		</Suspense>
	);
}

function SearchLandingContent() {
	const t = useTranslations('search');
	const { term, setTerm } = useLandingSearchUrlState();
	// `useScryfallCardSearch` débounce `filters.name` en interne (300 ms), mais pas
	// `useDeckSearch` / `useProfileSearch`. On débounce donc ici pour ces deux-là et
	// on passe `term` brut à la section cartes, sinon le délai s'applique deux fois.
	const debounced = useDebounce(term, 300);
	const hasTerm = debounced.trim().length > 0;

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchRow}>
					<SearchBar value={term} onChange={setTerm} placeholder={t('landingPlaceholder')} />
				</div>

				<div className={landing.sections}>
					{/* La section cartes reçoit `term` brut : son hook débounce lui-même.
					    Le `enabled` reste calculé sur la valeur débouncée pour que les
					    trois sections basculent ensemble entre pitch et résultats. */}
					<CardsSection term={term} enabled={hasTerm} />
					<DecksSection term={debounced} enabled={hasTerm} />
					<ProfilesSection term={debounced} enabled={hasTerm} />
				</div>
			</main>
		</div>
	);
}

/** En-tête commun aux trois sections : titre + lien « Voir plus » vers la route
 * dédiée, avec le terme courant pré-rempli sur le paramètre de cette entité. */
function SectionHeader({ title, href }: { title: string; href: string }) {
	const t = useTranslations('search');
	return (
		<div className={landing.sectionHeader}>
			<h2 className={landing.sectionTitle}>{title}</h2>
			<Link href={href} className={landing.seeMore}>
				{t('landingSeeMore')} →
			</Link>
		</div>
	);
}

function CardsSection({ term, enabled }: { term: string; enabled: boolean }) {
	const t = useTranslations('search');

	// Filtres neutres : la landing ne fait qu'une recherche par nom, les filtres
	// avancés vivent sur /search/cards. Mémoïsé car le hook a l'objet en dépendance.
	const filters = useMemo(
		() => ({
			name: term,
			colors: [],
			type: [],
			set: '',
			rarities: [],
			oracleText: '',
			cmc: '',
		}),
		[term]
	);

	const { cards, isLoading } = useScryfallCardSearch(filters, { enabled });

	const href = `/search/cards?name=${encodeURIComponent(term)}`;
	// `useScryfallCardSearch` CONSERVE ses derniers `cards` quand `enabled` repasse
	// à false (documenté dans le hook) : sans ce garde, vider le champ laisserait
	// les résultats précédents affichés à la place du pitch.
	const shown = useMemo(() => (enabled ? cards.slice(0, CARD_LIMIT) : []), [cards, enabled]);

	let body: ReactNode;
	if (!enabled) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingCardsPitch')}</p>;
	} else if (isLoading) {
		body = (
			<div className={styles.loading}>
				<Spinner size="md" />
			</div>
		);
	} else if (shown.length === 0) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>;
	} else {
		body = <CardList cards={shown} pageSize={false} viewModes={['grid']} />;
	}

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingCardsTitle')} href={enabled ? href : '/search/cards'} />
			{body}
		</section>
	);
}

function DecksSection({ term, enabled }: { term: string; enabled: boolean }) {
	const t = useTranslations('search');
	const router = useRouter();
	const symbolMap = useScryfallSymbols();

	const filters = useMemo(() => ({ ...DEFAULT_DECK_FILTERS, name: term }), [term]);
	const { decks, isLoading } = useDeckSearch(filters, enabled);

	const shown = useMemo(() => decks.slice(0, DECK_LIMIT), [decks]);
	const deckMetas = useMemo(() => shown.map((d) => d.deck), [shown]);
	const summaryMap = useDeckSummaries(deckMetas);

	const href = `/search/decks?name=${encodeURIComponent(term)}`;

	let body: ReactNode;
	if (!enabled) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingDecksPitch')}</p>;
	} else if (isLoading) {
		body = (
			<div className={styles.loading}>
				<Spinner size="md" />
			</div>
		);
	} else if (shown.length === 0) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>;
	} else {
		body = (
			<div className={styles.deckGrid}>
				{shown.map(({ deck, authorNickname }) => (
					<DeckCard
						key={deck.id}
						deck={deck}
						summary={summaryMap[deck.id]}
						symbolMap={symbolMap}
						authorNickname={authorNickname}
						isPrecon={deck.source === 'mtgjson'}
						readOnly
						onClick={() => router.push(`/decks/${deck.id}`)}
					/>
				))}
			</div>
		);
	}

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingDecksTitle')} href={enabled ? href : '/search/decks'} />
			{body}
		</section>
	);
}

function ProfilesSection({ term, enabled }: { term: string; enabled: boolean }) {
	const t = useTranslations('search');
	const { profiles, isLoading } = useProfileSearch(term, enabled);

	const shown = useMemo(() => profiles.slice(0, PROFILE_LIMIT), [profiles]);
	const ownerIds = useMemo(() => shown.map((p) => p.id), [shown]);
	const statsMap = useProfileStats(ownerIds);

	const href = `/search/profiles?q=${encodeURIComponent(term)}`;

	let body: ReactNode;
	if (!enabled) {
		body = (
			<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingProfilesPitch')}</p>
		);
	} else if (isLoading) {
		body = (
			<div className={styles.loading}>
				<Spinner size="md" />
			</div>
		);
	} else if (shown.length === 0) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>;
	} else {
		body = (
			<div className={styles.profileGrid}>
				{shown.map((p) => (
					<ProfileCard key={p.id} profile={p} stats={statsMap[p.id]} />
				))}
			</div>
		);
	}

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingProfilesTitle')} href={enabled ? href : '/search/profiles'} />
			{body}
		</section>
	);
}
