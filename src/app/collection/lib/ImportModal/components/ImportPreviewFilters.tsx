'use client';

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
	return (
		<>
			<div className={styles.searchRow}>
				<SearchBar
					value={nameFilter}
					onChange={onNameFilterChange}
					placeholder="Search by name..."
				/>
				<button className={styles.filterButton} onClick={onOpenFilterModal}>
					Filtres
					{activeFilterCount > 0 && <span className={styles.filterBadge}>{activeFilterCount}</span>}
				</button>
			</div>

			{isFiltered && (
				<span className={styles.resultCount}>
					{filteredCount > 0
						? // eslint-disable-next-line sonarjs/no-nested-conditional -- pluralization embedded in label
							`${filteredCount} card${filteredCount !== 1 ? 's' : ''}`
						: 'No result'}
					{totalCardCount > 0 && ` / ${totalCardCount}`}
				</span>
			)}
		</>
	);
}
