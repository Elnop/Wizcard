import type { GameTab } from '@/lib/scryfall/utils/set-classification';
import styles from './GameTabs.module.css';

export interface GameTabsProps {
	active: GameTab;
	onChange: (tab: GameTab) => void;
}

const TABS: { id: GameTab; label: string }[] = [
	{ id: 'all', label: 'Toutes' },
	{ id: 'paper', label: 'Papier' },
	{ id: 'mtga', label: 'MTGA' },
];

export function GameTabs({ active, onChange }: GameTabsProps) {
	return (
		<div role="tablist" className={styles.tabList}>
			{TABS.map((tab) => (
				<button
					key={tab.id}
					type="button"
					role="tab"
					className={styles.tab}
					data-active={active === tab.id}
					aria-selected={active === tab.id}
					onClick={() => onChange(tab.id)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
