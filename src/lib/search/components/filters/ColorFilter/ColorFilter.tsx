'use client';

import type { ScryfallColor, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { ManaSymbol } from '@/lib/card/components/ManaSymbol/ManaSymbol';
import styles from './ColorFilter.module.css';

export interface ColorFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
	colorMatch?: 'exact' | 'include' | 'atMost';
	onColorMatchChange?: (match: 'exact' | 'include' | 'atMost') => void;
	symbolMap?: Record<string, ScryfallCardSymbol>;
}

const colors: { id: ScryfallColor; name: string; symbol: string }[] = [
	{ id: 'W', name: 'White', symbol: 'W' },
	{ id: 'U', name: 'Blue', symbol: 'U' },
	{ id: 'B', name: 'Black', symbol: 'B' },
	{ id: 'R', name: 'Red', symbol: 'R' },
	{ id: 'G', name: 'Green', symbol: 'G' },
];

const matchOptions: { value: 'include' | 'exact' | 'atMost'; label: string }[] = [
	{ value: 'include', label: 'Inclut' },
	{ value: 'exact', label: 'Exactement' },
	{ value: 'atMost', label: 'Au plus' },
];

export function ColorFilter({
	selected,
	onChange,
	colorMatch = 'include',
	onColorMatchChange,
	symbolMap = {},
}: ColorFilterProps) {
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
						<ManaSymbol symbol={`{${color.id}}`} symbolMap={symbolMap} />
					</button>
				))}
			</div>
			{selected.length > 0 && onColorMatchChange && (
				<div
					className={styles.matchGroup}
					role="group"
					aria-label="Mode de correspondance des couleurs"
				>
					{matchOptions.map((opt) => (
						<label key={opt.value} className={styles.matchOption}>
							<input
								type="radio"
								name="colorMatch"
								value={opt.value}
								checked={colorMatch === opt.value}
								onChange={() => onColorMatchChange(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</div>
			)}
		</div>
	);
}
