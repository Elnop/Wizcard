'use client';

import { useTranslations } from 'next-intl';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import styles from '../ImportModal.module.css';

interface ImportPreviewFiltersProps {
	nameFilter: string;
	onNameFilterChange: (value: string) => void;
	activeFilterCount: number;
	onOpenFilterModal: () => void;
	isFiltered: boolean;
	filteredCount: number;
	totalCardCount: number;
}

export function ImportPreviewFilters({
	nameFilter,
	onNameFilterChange,
	activeFilterCount,
	onOpenFilterModal,
	isFiltered,
	filteredCount,
	totalCardCount,
}: ImportPreviewFiltersProps) {
	const t = useTranslations('collection');
	return (
		<>
			<div className={styles.searchRow}>
				<SearchBar
					value={nameFilter}
					onChange={onNameFilterChange}
					placeholder={t('searchByName')}
				/>
				<button className={styles.filterButton} onClick={onOpenFilterModal}>
					{t('filters')}
					{activeFilterCount > 0 && <span className={styles.filterBadge}>{activeFilterCount}</span>}
				</button>
			</div>

			{isFiltered && (
				<span className={styles.resultCount}>
					{filteredCount > 0 ? t('cardCount', { count: filteredCount }) : t('noResult')}
					{totalCardCount > 0 && ` / ${totalCardCount}`}
				</span>
			)}
		</>
	);
}
