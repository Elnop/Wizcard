'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from '../components/SearchEntitySwitcher/SearchEntitySwitcher';
import { ProfileSearchView } from '../views/ProfileSearchView';
import { useProfileSearchUrlState } from './useProfileSearchUrlState';
import styles from '../page.module.css';

export default function SearchProfilesPage() {
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
			<SearchProfilesContent />
		</Suspense>
	);
}

function SearchProfilesContent() {
	const { term, setTerm } = useProfileSearchUrlState();
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher />
				</div>
				<ProfileSearchView term={term} onTermChange={setTerm} />
			</main>
		</div>
	);
}
