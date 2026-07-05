'use client';

import type { ScryfallColor, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { MTG_COLORS } from '@/lib/mtg/colors';
import { useMultiSelect } from '@/lib/search/hooks/useMultiSelect';
import styles from '../ColorFilter/ColorFilter.module.css';

export interface ColorIdentityFilterProps {
	selected: ScryfallColor[];
	onChange: (colors: ScryfallColor[]) => void;
	symbolMap?: Record<string, ScryfallCardSymbol>;
}

export function ColorIdentityFilter({
	selected,
	onChange,
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
		</div>
	);
}
