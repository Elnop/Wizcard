'use client';

import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import styles from './ColorFilter.module.css';

export interface ColorFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
}

const colors: { id: ScryfallColor; name: string; symbol: string }[] = [
	{ id: 'W', name: 'White', symbol: 'W' },
	{ id: 'U', name: 'Blue', symbol: 'U' },
	{ id: 'B', name: 'Black', symbol: 'B' },
	{ id: 'R', name: 'Red', symbol: 'R' },
	{ id: 'G', name: 'Green', symbol: 'G' },
];

export function ColorFilter({ selected, onChange }: ColorFilterProps) {
	const handleToggle = (color: ScryfallColor) => {
		if (selected.includes(color)) {
			onChange(selected.filter((c) => c !== color));
		} else {
			onChange([...selected, color]);
		}
	};

	return (
		<div className={styles.container}>
			<span className={styles.label}>Colors</span>
			<div className={styles.colors}>
				{colors.map((color) => (
					<button
						key={color.id}
						type="button"
						className={`${styles.colorButton} ${selected.includes(color.id) ? styles.selected : ''}`}
						data-color={color.id}
						onClick={() => handleToggle(color.id)}
						aria-pressed={selected.includes(color.id)}
						title={color.name}
					>
						{color.symbol}
					</button>
				))}
			</div>
		</div>
	);
}
