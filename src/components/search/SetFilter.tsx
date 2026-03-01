'use client';

import { type ChangeEvent } from 'react';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import styles from './SearchFilters.module.css';

export interface SetFilterProps {
	value: string;
	onChange: (value: string) => void;
	sets: ScryfallSet[];
	isLoading?: boolean;
}

export function SetFilter({ value, onChange, sets, isLoading }: SetFilterProps) {
	const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
		onChange(e.target.value);
	};

	return (
		<div className={styles.filterGroup}>
			<label className={styles.label}>Set</label>
			<select className={styles.select} value={value} onChange={handleChange} disabled={isLoading}>
				<option value="">All Sets</option>
				{sets.map((set) => (
					<option key={set.code} value={set.code}>
						{set.name}
					</option>
				))}
			</select>
		</div>
	);
}
