'use client';

import { useMemo, useState } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { matchesTab, filterByName, type GameTab } from '@/lib/scryfall/utils/set-classification';
import { SetsCatalog } from './components/SetsCatalog/SetsCatalog';
import styles from './page.module.css';

export function SetsPageClient() {
	const { sets, isLoading, error } = useScryfallSets();
	const [activeTab, setActiveTab] = useState<GameTab>('all');
	const [query, setQuery] = useState('');

	const visibleCount = useMemo(
		() =>
			filterByName(
				sets.filter((s) => matchesTab(s, activeTab)),
				query
			).length,
		[sets, activeTab, query]
	);

	return (
		<main className={styles.main}>
			<div className={styles.titleSection}>
				<h1 className={styles.title}>Extensions</h1>
				{!isLoading && !error && (
					<p className={styles.statsLine}>
						{visibleCount} set{visibleCount > 1 ? 's' : ''}
						{(activeTab !== 'all' || query) && ` of ${sets.length}`}
					</p>
				)}
			</div>

			{isLoading && (
				<div className={styles.loading}>
					<Spinner size="lg" />
				</div>
			)}

			{error && !isLoading && (
				<div className={styles.error}>
					<p>Failed to load sets.</p>
				</div>
			)}

			{!isLoading && !error && (
				<SetsCatalog
					sets={sets}
					activeTab={activeTab}
					onTabChange={setActiveTab}
					query={query}
					onQueryChange={setQuery}
				/>
			)}
		</main>
	);
}
