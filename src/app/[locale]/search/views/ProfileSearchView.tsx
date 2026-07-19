'use client';

import { useTranslations } from 'next-intl';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { ProfileCard } from '@/lib/search/components/ProfileCard/ProfileCard';
import { useProfileSearch } from '@/lib/search/hooks/useProfileSearch';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from '../page.module.css';

type Props = { term: string; onTermChange: (t: string) => void };

export function ProfileSearchView({ term, onTermChange }: Props) {
	const t = useTranslations('search');
	const { profiles, isLoading, isLoadingMore, hasMore, total, loadMore } = useProfileSearch(term);

	return (
		<>
			<div className={styles.searchRow}>
				<SearchBar
					value={term}
					onChange={onTermChange}
					placeholder={t('profileSearchPlaceholder')}
				/>
			</div>

			{!isLoading && profiles.length > 0 && (
				<div className={styles.resultInfo}>
					<span>{t('profileResultsCount', { count: total })}</span>
				</div>
			)}

			{isLoading ? (
				<div className={styles.loading}>
					<Spinner size="lg" />
				</div>
			) : (
				<div className={styles.profileGrid}>
					{profiles.map((p) => (
						<ProfileCard key={p.id} profile={p} />
					))}
				</div>
			)}

			{hasMore && !isLoading && (
				<div className={styles.loadMore}>
					<button type="button" onClick={loadMore} disabled={isLoadingMore}>
						{isLoadingMore ? <Spinner size="sm" /> : t('loadMore')}
					</button>
				</div>
			)}
		</>
	);
}
