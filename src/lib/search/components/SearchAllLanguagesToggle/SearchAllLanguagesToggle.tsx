'use client';

import { useTranslations } from 'next-intl';
import styles from './SearchAllLanguagesToggle.module.css';

type Props = {
	value: boolean;
	onChange: (value: boolean) => void;
};

export function SearchAllLanguagesToggle({ value, onChange }: Props) {
	const t = useTranslations('search');
	return (
		<label
			className={`${styles.toggle} ${value ? styles.active : ''}`}
			aria-label={t('searchAllLanguagesAria')}
		>
			<input
				type="checkbox"
				className={styles.checkbox}
				checked={value}
				onChange={(e) => onChange(e.target.checked)}
			/>
			{t('searchAllLanguages')}
		</label>
	);
}
