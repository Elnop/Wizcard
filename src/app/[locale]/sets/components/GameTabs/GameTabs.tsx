'use client';

import { useTranslations } from 'next-intl';
import type { GameTab } from '@/lib/scryfall/utils/set-classification';
import styles from './GameTabs.module.css';

export interface GameTabsProps {
	active: GameTab;
	onChange: (tab: GameTab) => void;
}

const TAB_KEYS = { all: 'tabAll', paper: 'tabPaper', mtga: 'tabMtga' } as const;
const TABS: GameTab[] = ['all', 'paper', 'mtga'];

export function GameTabs({ active, onChange }: GameTabsProps) {
	const t = useTranslations('sets');
	return (
		<div role="tablist" className={styles.tabList}>
			{TABS.map((tab) => (
				<button
					key={tab}
					type="button"
					role="tab"
					className={styles.tab}
					data-active={active === tab}
					aria-selected={active === tab}
					onClick={() => onChange(tab)}
				>
					{t(TAB_KEYS[tab])}
				</button>
			))}
		</div>
	);
}
