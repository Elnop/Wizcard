'use client';

import type { ScryfallColor, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { ColorFilter } from './ColorFilter';
import { TypeFilter } from './TypeFilter';
import { SetFilter } from './SetFilter';
import { SortFilter, type ScryfallSortOrder, type ScryfallSortDir } from './SortFilter';
import styles from './SearchFilters.module.css';

export interface SearchFiltersProps {
	colors: ScryfallColor[];
	onColorsChange: (colors: ScryfallColor[]) => void;
	type: string;
	onTypeChange: (type: string) => void;
	set: string;
	onSetChange: (set: string) => void;
	sets: ScryfallSet[];
	setsLoading?: boolean;
	order: ScryfallSortOrder;
	onOrderChange: (order: ScryfallSortOrder) => void;
	dir: ScryfallSortDir;
	onDirChange: (dir: ScryfallSortDir) => void;
}

export function SearchFilters({
	colors,
	onColorsChange,
	type,
	onTypeChange,
	set,
	onSetChange,
	sets,
	setsLoading,
	order,
	onOrderChange,
	dir,
	onDirChange,
}: SearchFiltersProps) {
	return (
		<div className={styles.container}>
			<ColorFilter selected={colors} onChange={onColorsChange} />
			<TypeFilter value={type} onChange={onTypeChange} />
			<SetFilter value={set} onChange={onSetChange} sets={sets} isLoading={setsLoading} />
			<SortFilter
				order={order}
				onOrderChange={(v) => onOrderChange(v as ScryfallSortOrder)}
				dir={dir}
				onDirChange={onDirChange}
			/>
		</div>
	);
}
