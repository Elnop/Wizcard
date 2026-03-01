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
	order: ScryfallSortOrder;
	onOrderChange: (order: ScryfallSortOrder) => void;
	dir: ScryfallSortDir;
	onDirChange: (dir: ScryfallSortDir) => void;
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

const DIR_OPTIONS: { value: ScryfallSortDir; label: string }[] = [
	{ value: 'auto', label: 'Auto' },
	{ value: 'asc', label: 'Ascending' },
	{ value: 'desc', label: 'Descending' },
];

export function SortFilter({ order, onOrderChange, dir, onDirChange }: SortFilterProps) {
	const handleOrderChange = (e: ChangeEvent<HTMLSelectElement>) => {
		onOrderChange(e.target.value as ScryfallSortOrder);
	};

	const handleDirChange = (e: ChangeEvent<HTMLSelectElement>) => {
		onDirChange(e.target.value as ScryfallSortDir);
	};

	return (
		<>
			<div className={styles.filterGroup}>
				<label className={styles.label}>Sort By</label>
				<select className={styles.select} value={order} onChange={handleOrderChange}>
					{SORT_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<div className={styles.filterGroup}>
				<label className={styles.label}>Direction</label>
				<select className={styles.select} value={dir} onChange={handleDirChange}>
					{DIR_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
		</>
	);
}
