import type { CardType } from '@/lib/mpc/types';
import styles from './CardTypeFilter.module.css';

const OPTIONS: { value: CardType | 'all'; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'card', label: 'Cards' },
	{ value: 'token', label: 'Tokens' },
	{ value: 'cardback', label: 'Cardbacks' },
];

interface CardTypeFilterProps {
	value: CardType | 'all';
	onChange: (value: CardType | 'all') => void;
}

export function CardTypeFilter({ value, onChange }: CardTypeFilterProps) {
	return (
		<div className={styles.container}>
			<span className={styles.label}>Type de carte</span>
			<select
				className={styles.select}
				value={value}
				onChange={(e) => onChange(e.target.value as CardType | 'all')}
			>
				{OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}
