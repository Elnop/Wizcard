'use client';

import { useState } from 'react';
import styles from './SearchModeSwitcher.module.css';

export type SearchMode = 'official' | 'all' | 'custom';

const STORAGE_KEY = 'mpc-search-mode';
const DEFAULT_MODE: SearchMode = 'official';

const OPTIONS: { value: SearchMode; label: string }[] = [
	{ value: 'official', label: 'Officiel' },
	{ value: 'all', label: 'Tout' },
	{ value: 'custom', label: 'Custom' },
];

type Props = {
	onChange: (mode: SearchMode) => void;
};

function readStoredMode(): SearchMode {
	if (typeof window === 'undefined') return DEFAULT_MODE;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'official' || stored === 'all' || stored === 'custom') return stored;
	return DEFAULT_MODE;
}

export function SearchModeSwitcher({ onChange }: Props) {
	const [value, setValue] = useState<SearchMode>(readStoredMode);

	function handleClick(next: SearchMode) {
		setValue(next);
		localStorage.setItem(STORAGE_KEY, next);
		onChange(next);
	}

	return (
		<div className={styles.switcher} role="group" aria-label="Mode de recherche">
			{OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={`${styles.option} ${value === opt.value ? styles.active : ''}`}
					onClick={() => handleClick(opt.value)}
					aria-pressed={value === opt.value}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
