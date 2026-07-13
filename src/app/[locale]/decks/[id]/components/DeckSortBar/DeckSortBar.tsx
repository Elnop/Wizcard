'use client';

import { useTranslations } from 'next-intl';
import type { DeckSortDir, DeckSortOrder } from '../../useDeckSort';
import type { DeckGroupBy } from '../../useDeckCardSections';
import { Select } from '@/components/Select/Select';
import styles from './DeckSortBar.module.css';

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
	const t = useTranslations('decks');
	const nextDir = dir === 'asc' ? 'desc' : 'asc';

	const sortOptions: { value: DeckSortOrder; label: string }[] = [
		{ value: 'cmc', label: t('sortManaValue') },
		{ value: 'name', label: t('sortName') },
		{ value: 'rarity', label: t('sortRarity') },
	];
	const groupOptions: { value: DeckGroupBy; label: string }[] = [
		{ value: 'type', label: t('groupByType') },
		{ value: 'none', label: t('groupNone') },
	];

	return (
		<div className={styles.bar}>
			<div className={styles.field}>
				<span className={styles.label}>{t('group')}</span>
				<Select
					value={groupBy}
					options={groupOptions}
					onChange={onGroupByChange}
					ariaLabel={t('groupBy')}
				/>
			</div>

			<div className={styles.field}>
				<span className={styles.label}>{t('sort')}</span>
				<Select
					value={order}
					options={sortOptions}
					onChange={onOrderChange}
					ariaLabel={t('sortBy')}
				/>
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
