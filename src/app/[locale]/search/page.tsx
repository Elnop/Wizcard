'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { SearchEntitySwitcher } from './components/SearchEntitySwitcher/SearchEntitySwitcher';
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
	// `useScryfallCardSearch` débounce `filters.name` en interne ; on débounce ici
	// pour les deux autres sections. Les résultats par défaut s'affichent term vide.
	const debounced = useDebounce(term, 300);

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				{/* Switcher présent sur la landing pour une navigation cohérente avec
				    les trois routes dédiées ; aucun onglet n'est actif ici (pathname
				    `/search` ne matche aucun href de mode). */}
				<div className={`${styles.searchSection} ${landing.searchSection}`}>
					<SearchEntitySwitcher />
					<div className={styles.searchRow}>
						<SearchBar value={term} onChange={setTerm} placeholder={t('landingPlaceholder')} />
					</div>
				</div>

				<div className={landing.sections}>
					<CardsSection term={term} />
					<DecksSection term={debounced} />
					<ProfilesSection term={debounced} />
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

function CardsSection({ term }: { term: string }) {
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

	// enabled: true en permanence → term vide affiche le défaut du hook
	// (f:edh order:edhrec). Plus de garde `enabled ? … : []` : on ne repasse
	// jamais à enabled=false, donc les résultats ne sont jamais périmés.
	const { cards, isLoading } = useScryfallCardSearch(filters, { enabled: true });

	const shown = useMemo(() => cards.slice(0, CARD_LIMIT), [cards]);
	const href = term ? `/search/cards?name=${encodeURIComponent(term)}` : '/search/cards';

	let body: ReactNode;
	if (isLoading) {
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
			<SectionHeader title={t('landingCardsTitle')} href={href} />
			{body}
		</section>
	);
}

function DecksSection({ term }: { term: string }) {
	const t = useTranslations('search');
	const router = useRouter();
	const symbolMap = useScryfallSymbols();

	const filters = useMemo(() => ({ ...DEFAULT_DECK_FILTERS, name: term }), [term]);
	// enabled: true → term vide affiche les decks publics récents (searchDecks
	// trie created_at DESC à vide).
	const { decks, isLoading } = useDeckSearch(filters, true);

	const shown = useMemo(() => decks.slice(0, DECK_LIMIT), [decks]);
	const deckMetas = useMemo(() => shown.map((d) => d.deck), [shown]);
	const summaryMap = useDeckSummaries(deckMetas);

	const href = term ? `/search/decks?name=${encodeURIComponent(term)}` : '/search/decks';

	let body: ReactNode;
	if (isLoading) {
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
			<SectionHeader title={t('landingDecksTitle')} href={href} />
			{body}
		</section>
	);
}

function ProfilesSection({ term }: { term: string }) {
	const t = useTranslations('search');
	// enabled: true → term vide affiche le classement par nombre de decks publics
	// (searchProfiles interroge la vue profiles_by_public_deck_count à vide).
	const { profiles, isLoading } = useProfileSearch(term, true);

	const shown = useMemo(() => profiles.slice(0, PROFILE_LIMIT), [profiles]);
	const ownerIds = useMemo(() => shown.map((p) => p.id), [shown]);
	const statsMap = useProfileStats(ownerIds);

	const href = term ? `/search/profiles?q=${encodeURIComponent(term)}` : '/search/profiles';

	let body: ReactNode;
	if (isLoading) {
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
			<SectionHeader title={t('landingProfilesTitle')} href={href} />
			{body}
		</section>
	);
}
