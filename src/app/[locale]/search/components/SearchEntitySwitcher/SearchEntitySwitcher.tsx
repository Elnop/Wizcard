'use client';

import { useTranslations } from 'next-intl';
import styles from './SearchEntitySwitcher.module.css';
import type { SearchEntity } from '@/lib/search/types';

const ENTITY_KEYS = {
	cards: 'entityCards',
	decks: 'entityDecks',
	profiles: 'entityProfiles',
} as const;

const ENTITIES: SearchEntity[] = ['cards', 'decks', 'profiles'];

type Props = { value: SearchEntity; onChange: (e: SearchEntity) => void };

export function SearchEntitySwitcher({ value, onChange }: Props) {
	const t = useTranslations('search');
	return (
		<div className={styles.switcher} role="group" aria-label={t('entityAriaLabel')}>
			{ENTITIES.map((entity) => (
				<button
					key={entity}
					type="button"
					className={`${styles.option} ${value === entity ? styles.active : ''}`}
					onClick={() => onChange(entity)}
					aria-pressed={value === entity}
				>
					{t(ENTITY_KEYS[entity])}
				</button>
			))}
		</div>
	);
}
