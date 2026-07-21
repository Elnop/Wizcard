'use client';

import { useTranslations } from 'next-intl';
import styles from './CardModeSwitcher.module.css';

export type CardMode = 'cards' | 'token';

type Props = {
	value: CardMode;
	onChange: (mode: CardMode) => void;
};

export function CardModeSwitcher({ value, onChange }: Props) {
	const t = useTranslations('decks');
	const options: { value: CardMode; label: string }[] = [
		{ value: 'cards', label: t('modeCards') },
		{ value: 'token', label: t('modeToken') },
	];
	return (
		<div className={styles.switcher} role="group" aria-label={t('cardMode')}>
			{options.map((opt) => (
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
