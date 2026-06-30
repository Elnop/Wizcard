'use client';

import type { ScryfallColor, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import type { ColorMatch } from '@/lib/search/types';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { MTG_COLORS } from '@/lib/mtg/colors';
import { useMultiSelect } from '@/lib/search/hooks/useMultiSelect';
import styles from './ColorFilter.module.css';

export interface ColorFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
	colorMatch?: ColorMatch;
	onColorMatchChange?: (match: ColorMatch) => void;
	symbolMap?: Record<string, ScryfallCardSymbol>;
}

const matchOptions: { value: ColorMatch; label: string }[] = [
	{ value: 'include', label: 'Inclut' },
	{ value: 'exact', label: 'Exactement' },
	{ value: 'atMost', label: 'At most' },
];

export function ColorFilter({
	selected,
	onChange,
	colorMatch = 'include',
	onColorMatchChange,
	symbolMap = {},
}: ColorFilterProps) {
	const { toggle: handleToggle } = useMultiSelect(selected, onChange);

	return (
		<div className={styles.container}>
			<span className={styles.label}>Colors</span>
			<div className={styles.colors}>
				{MTG_COLORS.map((color) => (
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
				<div className={styles.matchGroup} role="group" aria-label="Color matching mode">
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
