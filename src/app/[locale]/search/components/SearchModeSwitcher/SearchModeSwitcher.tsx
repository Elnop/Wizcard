'use client';

import { useTranslations } from 'next-intl';
import styles from './SearchModeSwitcher.module.css';
import type { SearchMode } from '@/lib/search/types';

export type { SearchMode } from '@/lib/search/types';

const MODE_KEYS = {
	official: 'modeOfficial',
	custom: 'modeCustom',
	backs: 'modeBacks',
} as const;

const MODES: SearchMode[] = ['official', 'custom', 'backs'];

type Props = {
	value: SearchMode;
	onChange: (mode: SearchMode) => void;
};

export function SearchModeSwitcher({ value, onChange }: Props) {
	const t = useTranslations('search');
	return (
		<div className={styles.switcher} role="group" aria-label={t('modeAriaLabel')}>
			{MODES.map((mode) => (
				<button
					key={mode}
					type="button"
					className={`${styles.option} ${value === mode ? styles.active : ''}`}
					onClick={() => onChange(mode)}
					aria-pressed={value === mode}
				>
					{t(MODE_KEYS[mode])}
				</button>
			))}
		</div>
	);
}
