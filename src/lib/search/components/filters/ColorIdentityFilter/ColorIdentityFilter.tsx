'use client';

import type { ScryfallColor, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { MTG_COLORS } from '@/lib/mtg/colors';
import { useMultiSelect } from '@/lib/search/hooks/useMultiSelect';
import styles from '../ColorFilter/ColorFilter.module.css';

export type ColorIdentityMatch = 'atMost' | 'exact';

export interface ColorIdentityFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
	colorIdentityMatch?: ColorIdentityMatch;
	onColorIdentityMatchChange?: (match: ColorIdentityMatch) => void;
	symbolMap?: Record<string, ScryfallCardSymbol>;
}

const matchOptions: { value: ColorIdentityMatch; label: string }[] = [
	{ value: 'atMost', label: 'At most' },
	{ value: 'exact', label: 'Exactly' },
];

export function ColorIdentityFilter({
	selected,
	onChange,
	colorIdentityMatch = 'atMost',
	onColorIdentityMatchChange,
	symbolMap = {},
}: ColorIdentityFilterProps) {
	const { toggle: handleToggle } = useMultiSelect(selected, onChange);

	return (
		<div className={styles.container}>
			<span className={styles.label}>Color identity</span>
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
			{selected.length > 0 && onColorIdentityMatchChange && (
				<div className={styles.matchGroup} role="group" aria-label="Color identity matching mode">
					{matchOptions.map((opt) => (
						<label key={opt.value} className={styles.matchOption}>
							<input
								type="radio"
								name="colorIdentityMatch"
								value={opt.value}
								checked={colorIdentityMatch === opt.value}
								onChange={() => onColorIdentityMatchChange(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</div>
			)}
		</div>
	);
}
