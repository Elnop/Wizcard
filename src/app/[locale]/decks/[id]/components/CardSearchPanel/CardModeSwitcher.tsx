'use client';

import styles from './CardModeSwitcher.module.css';

export type CardMode = 'cards' | 'token';

const OPTIONS: { value: CardMode; label: string }[] = [
	{ value: 'cards', label: 'Cards' },
	{ value: 'token', label: 'Token' },
];

type Props = {
	value: CardMode;
	onChange: (mode: CardMode) => void;
};

export function CardModeSwitcher({ value, onChange }: Props) {
	return (
		<div className={styles.switcher} role="group" aria-label="Card mode">
			{OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={`${styles.option} ${value === opt.value ? styles.active : ''}`}
					onClick={() => onChange(opt.value)}
					aria-pressed={value === opt.value}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
