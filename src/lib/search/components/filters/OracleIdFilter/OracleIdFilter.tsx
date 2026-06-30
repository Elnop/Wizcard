export type OracleIdFilterValue = 'all' | 'defined' | 'undefined';

import styles from './OracleIdFilter.module.css';

const OPTIONS: { value: OracleIdFilterValue; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'defined', label: 'Defined' },
	{ value: 'undefined', label: 'Undefined' },
];

interface OracleIdFilterProps {
	value: OracleIdFilterValue;
	onChange: (value: OracleIdFilterValue) => void;
}

export function OracleIdFilter({ value, onChange }: OracleIdFilterProps) {
	return (
		<div className={styles.container}>
			<span className={styles.label}>Oracle ID</span>
			<div className={styles.options}>
				{OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						className={`${styles.optionButton} ${value === opt.value ? styles.selected : ''}`}
						onClick={() => onChange(opt.value)}
						aria-pressed={value === opt.value}
					>
						{opt.label}
					</button>
				))}
			</div>
		</div>
	);
}
