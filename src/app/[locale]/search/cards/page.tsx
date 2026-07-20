'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from '../components/SearchEntitySwitcher/SearchEntitySwitcher';
import { CardSearchView } from '../views/CardSearchView';
import { useCardSearchUrlState } from './useCardSearchUrlState';
import styles from '../page.module.css';

export default function SearchCardsPage() {
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
			<SearchCardsContent />
		</Suspense>
	);
}

function SearchCardsContent() {
	const cardState = useCardSearchUrlState();
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher />
				</div>
				<CardSearchView cardState={cardState} />
			</main>
		</div>
	);
}
