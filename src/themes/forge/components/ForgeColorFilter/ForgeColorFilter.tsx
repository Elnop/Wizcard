'use client';

import { MANA_COLORS } from '@/themes/_shared/mockData';
import type { ManaColor } from '@/themes/_shared/types';
import styles from './ForgeColorFilter.module.css';

export interface ColorFilterProps {
	selected: ManaColor[];
	onChange: (colors: ManaColor[]) => void;
	colorMatch?: 'exact' | 'include' | 'atMost';
	onColorMatchChange?: (match: 'exact' | 'include' | 'atMost') => void;
}

const matchOptions: { value: 'include' | 'exact' | 'atMost'; label: string }[] = [
	{ value: 'include', label: 'Includes' },
	{ value: 'exact', label: 'Exactly' },
	{ value: 'atMost', label: 'At Most' },
];

const GLOW_MAP: Record<string, string> = {
	W: 'var(--mana-glow-white)',
	U: 'var(--mana-glow-blue)',
	B: 'var(--mana-glow-black)',
	R: 'var(--mana-glow-red)',
	G: 'var(--mana-glow-green)',
	C: 'var(--mana-glow-colorless)',
};

export function ForgeColorFilter({
	selected,
	onChange,
	colorMatch = 'include',
	onColorMatchChange,
}: ColorFilterProps) {
	const toggle = (id: ManaColor) => {
		onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
	};

	return (
		<div className={styles.container}>
			<span className={styles.label}>Colors</span>
			<div className={styles.colors}>
				{MANA_COLORS.map((color) => (
					<button
						key={color.id}
						type="button"
						className={`${styles.colorButton} ${selected.includes(color.id) ? styles.selected : ''}`}
						onClick={() => toggle(color.id)}
						aria-pressed={selected.includes(color.id)}
						title={color.name}
						style={{ '--glow': GLOW_MAP[color.id] } as React.CSSProperties}
					>
						<span className={styles.pip} style={{ backgroundColor: color.color }} />
					</button>
				))}
			</div>
			{selected.length > 0 && onColorMatchChange && (
				<div className={styles.matchGroup} role="group" aria-label="Color match mode">
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
