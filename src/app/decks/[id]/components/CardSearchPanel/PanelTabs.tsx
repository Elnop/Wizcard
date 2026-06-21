'use client';

import styles from './PanelTabs.module.css';

export type PanelTab = 'search' | 'edhrec';

const TABS: { value: PanelTab; label: string }[] = [
	{ value: 'search', label: 'Search' },
	{ value: 'edhrec', label: 'EDHREC' },
];

type Props = {
	value: PanelTab;
	onChange: (tab: PanelTab) => void;
};

export function PanelTabs({ value, onChange }: Props) {
	return (
		<div className={styles.tabs} role="tablist" aria-label="Add cards source">
			{TABS.map((tab) => (
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
