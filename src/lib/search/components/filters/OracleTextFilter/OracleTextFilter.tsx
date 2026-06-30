'use client';

import styles from './OracleTextFilter.module.css';

export interface OracleTextFilterProps {
	value: string;
	onChange: (v: string) => void;
}

export function OracleTextFilter({ value, onChange }: OracleTextFilterProps) {
	return (
		<div className={styles.container}>
			<label className={styles.label} htmlFor="oracle-text-filter">
				Rules text
			</label>
			<input
				id="oracle-text-filter"
				type="text"
				className={styles.input}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder='e.g. "flying" or "draw a card"'
			/>
		</div>
	);
}
