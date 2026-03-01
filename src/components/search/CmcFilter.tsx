'use client';

import styles from './CmcFilter.module.css';

const operators = [
	{ value: '', label: 'Any' },
	{ value: ':', label: 'Exactement' },
	{ value: '>=', label: 'Au moins' },
	{ value: '<=', label: 'Au plus' },
];

export interface CmcFilterProps {
	value: string;
	onChange: (v: string) => void;
}

function parseValue(raw: string): { op: string; num: string } {
	if (!raw) return { op: '', num: '' };
	const match = raw.match(/^(>=|<=|>|<|:)?(\d*)$/);
	if (!match) return { op: '', num: '' };
	return { op: match[1] ?? '', num: match[2] ?? '' };
}

export function CmcFilter({ value, onChange }: CmcFilterProps) {
	const { op, num } = parseValue(value);

	const handleOpChange = (newOp: string) => {
		if (!newOp || !num) {
			onChange(newOp && num ? `${newOp}${num}` : '');
		} else {
			onChange(`${newOp}${num}`);
		}
	};

	const handleNumChange = (newNum: string) => {
		if (!newNum || !op) {
			onChange('');
		} else {
			onChange(`${op}${newNum}`);
		}
	};

	return (
		<div className={styles.container}>
			<span className={styles.label}>Coût converti (CMC)</span>
			<div className={styles.row}>
				<select
					className={styles.select}
					value={op}
					onChange={(e) => handleOpChange(e.target.value)}
					aria-label="Opérateur CMC"
				>
					{operators.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<input
					type="number"
					className={styles.input}
					value={num}
					min={0}
					onChange={(e) => handleNumChange(e.target.value)}
					placeholder="0"
					aria-label="Valeur CMC"
					disabled={!op}
				/>
			</div>
		</div>
	);
}
