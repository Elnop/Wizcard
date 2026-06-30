'use client';

import type { DeckSortDir, DeckSortOrder } from '../../useDeckSort';
import type { DeckGroupBy } from '../../useDeckCardSections';
import { Select } from '@/components/Select/Select';
import styles from './DeckSortBar.module.css';

const SORT_OPTIONS: { value: DeckSortOrder; label: string }[] = [
	{ value: 'cmc', label: 'Mana value' },
	{ value: 'name', label: 'Name' },
	{ value: 'rarity', label: 'Rarity' },
];

const GROUP_OPTIONS: { value: DeckGroupBy; label: string }[] = [
	{ value: 'type', label: 'By type' },
	{ value: 'none', label: 'No grouping' },
];

interface DeckSortBarProps {
	order: DeckSortOrder;
	dir: DeckSortDir;
	onOrderChange: (order: DeckSortOrder) => void;
	onDirChange: (dir: DeckSortDir) => void;
	groupBy: DeckGroupBy;
	onGroupByChange: (groupBy: DeckGroupBy) => void;
}

export function DeckSortBar({
	order,
	dir,
	onOrderChange,
	onDirChange,
	groupBy,
	onGroupByChange,
}: DeckSortBarProps) {
	const nextDir = dir === 'asc' ? 'desc' : 'asc';

	return (
		<div className={styles.bar}>
			<div className={styles.field}>
				<span className={styles.label}>Group</span>
				<Select
					value={groupBy}
					options={GROUP_OPTIONS}
					onChange={onGroupByChange}
					ariaLabel="Group by"
				/>
			</div>

			<div className={styles.field}>
				<span className={styles.label}>Sort</span>
				<Select value={order} options={SORT_OPTIONS} onChange={onOrderChange} ariaLabel="Sort by" />
			</div>

			<button
				type="button"
				className={`${styles.dirToggle} ${dir !== 'asc' ? styles.dirToggleActive : ''}`}
				onClick={() => onDirChange(nextDir)}
				aria-label={dir === 'asc' ? 'Ascending' : 'Descending'}
				title={dir === 'asc' ? 'Ascending' : 'Descending'}
			>
				{dir === 'asc' ? (
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M8 13V3M4 7l4-4 4 4"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				) : (
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M8 3v10M4 9l4 4 4-4"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				)}
			</button>
		</div>
	);
}
