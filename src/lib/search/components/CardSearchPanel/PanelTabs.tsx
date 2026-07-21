'use client';

import { useTranslations } from 'next-intl';
import styles from './PanelTabs.module.css';

export type PanelTab = 'search' | 'edhrec';

type Props = {
	value: PanelTab;
	onChange: (tab: PanelTab) => void;
};

export function PanelTabs({ value, onChange }: Props) {
	const t = useTranslations('decks');
	// EDHREC is a proper name (kept as-is); only "Search" is translated.
	const tabs: { value: PanelTab; label: string }[] = [
		{ value: 'search', label: t('tabSearch') },
		{ value: 'edhrec', label: 'EDHREC' },
	];
	return (
		<div className={styles.tabs} role="tablist" aria-label={t('addCardsSource')}>
			{tabs.map((tab) => (
				<button
					key={tab.value}
					type="button"
					role="tab"
					className={`${styles.tab} ${value === tab.value ? styles.active : ''}`}
					onClick={() => onChange(tab.value)}
					aria-selected={value === tab.value}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
