'use client';

import styles from './SearchModeSwitcher.module.css';
import type { SearchMode } from '@/lib/search/types';

export type { SearchMode } from '@/lib/search/types';

const OPTIONS: { value: SearchMode; label: string }[] = [
	{ value: 'official', label: 'Officiel' },
	{ value: 'custom', label: 'Custom' },
	{ value: 'backs', label: 'Backs' },
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
