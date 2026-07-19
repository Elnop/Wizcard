'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from './components/SearchEntitySwitcher/SearchEntitySwitcher';
import { CardSearchView } from './views/CardSearchView';
import { DeckSearchView } from './views/DeckSearchView';
import { ProfileSearchView } from './views/ProfileSearchView';
import { useSearchFiltersFromUrl } from './useSearchFiltersFromUrl';
import styles from './page.module.css';

export default function SearchPage() {
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
			<SearchPageContent />
		</Suspense>
	);
}

function SearchPageContent() {
	const searchState = useSearchFiltersFromUrl();
	const { entity, setEntity, deckFilters, setDeckFilters, profileTerm, setProfileTerm } =
		searchState;

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher value={entity} onChange={setEntity} />
				</div>
				{entity === 'cards' && <CardSearchView cardState={searchState} />}
				{entity === 'decks' && (
					<DeckSearchView filters={deckFilters} onFiltersChange={setDeckFilters} />
				)}
				{entity === 'profiles' && (
					<ProfileSearchView term={profileTerm} onTermChange={setProfileTerm} />
				)}
			</main>
		</div>
	);
}
