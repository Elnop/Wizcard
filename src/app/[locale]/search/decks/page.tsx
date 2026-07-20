'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from '../components/SearchEntitySwitcher/SearchEntitySwitcher';
import { DeckSearchView } from '../views/DeckSearchView';
import { useDeckSearchUrlState } from './useDeckSearchUrlState';
import styles from '../page.module.css';

export default function SearchDecksPage() {
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
			<SearchDecksContent />
		</Suspense>
	);
}

function SearchDecksContent() {
	const { filters, setFilters } = useDeckSearchUrlState();
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher />
				</div>
				<DeckSearchView filters={filters} onFiltersChange={setFilters} />
			</main>
		</div>
	);
}
