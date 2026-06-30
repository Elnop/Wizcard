'use client';

import { useMultiSelect } from '@/lib/search/hooks/useMultiSelect';
import styles from './RarityFilter.module.css';

const rarities: { id: string; name: string }[] = [
	{ id: 'common', name: 'Common' },
	{ id: 'uncommon', name: 'Uncommon' },
	{ id: 'rare', name: 'Rare' },
	{ id: 'mythic', name: 'Mythic' },
];

export interface RarityFilterProps {
	value: string[];
	onChange: (v: string[]) => void;
}

export function RarityFilter({ value, onChange }: RarityFilterProps) {
	const { toggle: handleToggle } = useMultiSelect(value, onChange);

	return (
		<div className={styles.container}>
			<span className={styles.label}>Rarity</span>
			<div className={styles.rarities}>
				{rarities.map((rarity) => (
					<button
						key={rarity.id}
						type="button"
						className={`${styles.rarityButton} ${value.includes(rarity.id) ? styles.selected : ''}`}
						data-rarity={rarity.id}
						onClick={() => handleToggle(rarity.id)}
						aria-pressed={value.includes(rarity.id)}
					>
						<span className={styles.diamond} />
						{rarity.name}
					</button>
				))}
			</div>
		</div>
	);
}
