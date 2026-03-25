'use client';

import { type ChangeEvent } from 'react';
import styles from './SearchFilters.module.css';

export type ScryfallSortOrder =
	| 'name'
	| 'set'
	| 'released'
	| 'rarity'
	| 'color'
	| 'usd'
	| 'tix'
	| 'eur'
	| 'cmc'
	| 'power'
	| 'toughness'
	| 'edhrec'
	| 'penny'
	| 'artist'
	| 'review';

export type ScryfallSortDir = 'auto' | 'asc' | 'desc';

export interface SortFilterProps {
	order: string;
	onOrderChange: (order: string) => void;
	dir: ScryfallSortDir;
	onDirChange: (dir: ScryfallSortDir) => void;
	allowAuto?: boolean;
	extraOptions?: { value: string; label: string }[];
}

const SORT_OPTIONS: { value: ScryfallSortOrder; label: string }[] = [
	{ value: 'name', label: 'Name' },
	{ value: 'released', label: 'Release Date' },
	{ value: 'set', label: 'Set' },
	{ value: 'rarity', label: 'Rarity' },
	{ value: 'color', label: 'Color' },
	{ value: 'cmc', label: 'Mana Value' },
	{ value: 'power', label: 'Power' },
	{ value: 'toughness', label: 'Toughness' },
	{ value: 'usd', label: 'Price (USD)' },
	{ value: 'eur', label: 'Price (EUR)' },
	{ value: 'tix', label: 'Price (TIX)' },
	{ value: 'edhrec', label: 'EDHREC Rank' },
	{ value: 'penny', label: 'Penny Rank' },
	{ value: 'artist', label: 'Artist' },
	{ value: 'review', label: 'Review Date' },
];

const DIR_CYCLE: ScryfallSortDir[] = ['auto', 'asc', 'desc'];
const DIR_CYCLE_NO_AUTO: ScryfallSortDir[] = ['asc', 'desc'];

function DirToggle({
	dir,
	onDirChange,
	allowAuto = true,
}: {
	dir: ScryfallSortDir;
	onDirChange: (dir: ScryfallSortDir) => void;
	allowAuto?: boolean;
}) {
	const cycle = allowAuto ? DIR_CYCLE : DIR_CYCLE_NO_AUTO;
	const next = cycle[(cycle.indexOf(dir) + 1) % cycle.length];
	const label = dir === 'asc' ? 'Ascending' : dir === 'desc' ? 'Descending' : 'Auto';

	return (
		<button
			type="button"
			className={`${styles.dirToggle} ${styles[`dirToggle_${dir}`]}`}
			onClick={() => onDirChange(next)}
			aria-label={`Direction: ${label}`}
			title={label}
		>
			{dir === 'asc' && (
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M8 13V3M4 7l4-4 4 4"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
			{dir === 'desc' && (
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M8 3v10M4 9l4 4 4-4"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
			{dir === 'auto' && (
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M5 4v8M3 10l2 2 2-2M11 4v8M9 6l2-2 2 2"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
		</button>
	);
}

export function SortFilter({
	order,
	onOrderChange,
	dir,
	onDirChange,
	allowAuto = true,
	extraOptions,
}: SortFilterProps) {
	const handleOrderChange = (e: ChangeEvent<HTMLSelectElement>) => {
		onOrderChange(e.target.value);
	};

	const allOptions = extraOptions ? [...SORT_OPTIONS, ...extraOptions] : SORT_OPTIONS;

	return (
		<div className={styles.sortRow}>
			<div className={styles.filterGroup}>
				<label className={styles.label}>Sort By</label>
				<select className={styles.select} value={order} onChange={handleOrderChange}>
					{allOptions.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<DirToggle dir={dir} onDirChange={onDirChange} allowAuto={allowAuto} />
		</div>
	);
}
