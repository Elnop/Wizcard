'use client';

import styles from './ForgeRarityFilter.module.css';

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

export function ForgeRarityFilter({ value, onChange }: RarityFilterProps) {
	const toggle = (id: string) => {
		onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
	};

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
						onClick={() => toggle(rarity.id)}
						aria-pressed={value.includes(rarity.id)}
					>
						{rarity.name}
					</button>
				))}
			</div>
		</div>
	);
}
