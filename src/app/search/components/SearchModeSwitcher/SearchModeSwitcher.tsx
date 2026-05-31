'use client';

import { useSyncExternalStore } from 'react';
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

function getSnapshot(): SearchMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'official' || stored === 'all' || stored === 'custom') return stored;
	} catch {
		// localStorage unavailable
	}
	return DEFAULT_MODE;
}

function getServerSnapshot(): SearchMode {
	return DEFAULT_MODE;
}

function subscribe(cb: () => void): () => void {
	window.addEventListener('storage', cb);
	return () => window.removeEventListener('storage', cb);
}

export function SearchModeSwitcher({ onChange }: Props) {
	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	function handleClick(next: SearchMode) {
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// localStorage unavailable
		}
		// Dispatch storage event so useSyncExternalStore re-reads
		window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next }));
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
