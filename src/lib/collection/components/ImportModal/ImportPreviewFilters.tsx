'use client';

import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import styles from './ImportModal.module.css';

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
					placeholder="Rechercher par nom..."
				/>
				<button className={styles.filterButton} onClick={onOpenFilterModal}>
					Filtres
					{activeFilterCount > 0 && <span className={styles.filterBadge}>{activeFilterCount}</span>}
				</button>
			</div>

			{isFiltered && (
				<span className={styles.resultCount}>
					{filteredCount > 0
						? `${filteredCount} carte${filteredCount !== 1 ? 's' : ''}`
						: 'Aucun résultat'}
					{totalCardCount > 0 && ` / ${totalCardCount}`}
				</span>
			)}
		</>
	);
}
