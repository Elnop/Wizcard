'use client';

import type { SetGroup } from '@/lib/scryfall/utils/set-classification';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { SetCompletion } from '../../utils/setCompletion';
import { SetCardsGrid } from '../SetCardsGrid/SetCardsGrid';
import styles from './SetTabs.module.css';

export interface SetTabsProps {
	group: SetGroup;
	activeId: string;
	onTabChange: (code: string) => void;
	completion: SetCompletion;
	allCards: ScryfallCard[];
	isCompletionLoading: boolean;
}

export function SetTabs({
	group,
	activeId,
	onTabChange,
	completion,
	allCards,
	isCompletionLoading,
}: SetTabsProps) {
	const tabs = group.sets;

	return (
		<div className={styles.wrapper}>
			<div className={styles.tabList} role="tablist">
				{tabs.map((set) => (
					<button
						key={set.code}
						role="tab"
						type="button"
						className={styles.tab}
						data-active={activeId === set.code}
						aria-selected={activeId === set.code}
						onClick={() => onTabChange(set.code)}
					>
						<span className={styles.tabName}>{set.name}</span>
						<span className={styles.tabCode}>{set.code.toUpperCase()}</span>
					</button>
				))}
			</div>

			<SetCardsGrid
				key={activeId}
				setCode={activeId}
				completion={completion}
				allCards={allCards}
				isCompletionLoading={isCompletionLoading}
			/>
		</div>
	);
}
