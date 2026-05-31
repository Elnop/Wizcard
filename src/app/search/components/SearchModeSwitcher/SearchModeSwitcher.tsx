'use client';

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
	value: SearchMode;
	onChange: (mode: SearchMode) => void;
};

export function SearchModeSwitcher({ value, onChange }: Props) {
	return (
		<div className={styles.switcher} role="group" aria-label="Mode de recherche">
			{OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={`${styles.option} ${value === opt.value ? styles.active : ''}`}
					onClick={() => onChange(opt.value)}
					aria-pressed={value === opt.value}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

export function readSearchMode(): SearchMode {
	if (typeof window === 'undefined') return DEFAULT_MODE;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'official' || stored === 'all' || stored === 'custom') return stored;
	return DEFAULT_MODE;
}

export function writeSearchMode(mode: SearchMode): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, mode);
}
