'use client';

import { type ChangeEvent } from 'react';
import styles from './SearchFilters.module.css';

export interface TypeFilterProps {
	value: string;
	onChange: (value: string) => void;
}

const cardTypes = [
	{ value: '', label: 'All Types' },
	{ value: 'creature', label: 'Creature' },
	{ value: 'instant', label: 'Instant' },
	{ value: 'sorcery', label: 'Sorcery' },
	{ value: 'enchantment', label: 'Enchantment' },
	{ value: 'artifact', label: 'Artifact' },
	{ value: 'planeswalker', label: 'Planeswalker' },
	{ value: 'land', label: 'Land' },
	{ value: 'battle', label: 'Battle' },
];

export function TypeFilter({ value, onChange }: TypeFilterProps) {
	const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
		onChange(e.target.value);
	};

	return (
		<div className={styles.filterGroup}>
			<label className={styles.label}>Type</label>
			<select className={styles.select} value={value} onChange={handleChange}>
				{cardTypes.map((type) => (
					<option key={type.value} value={type.value}>
						{type.label}
					</option>
				))}
			</select>
		</div>
	);
}
